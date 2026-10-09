#include "grant_verifier.h"

#include <string.h>

#include "cJSON.h"
#include "device_config.h"
#include "esp_log.h"
#include "psa/crypto.h"

static const char *TAG = "GRANT_VERIFY";
static char s_last_nonce[96];
static bool s_psa_initialized;

static bool json_string_equals(const cJSON *object, const char *name, const char *expected)
{
    const cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    return cJSON_IsString(value) && value->valuestring != NULL && expected != NULL &&
           strcmp(value->valuestring, expected) == 0;
}

static const char *json_string(const cJSON *object, const char *name)
{
    const cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    return cJSON_IsString(value) ? value->valuestring : NULL;
}

static bool json_integer(const cJSON *object, const char *name, int64_t *out)
{
    const cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    if (!cJSON_IsNumber(value) || out == NULL) {
        return false;
    }
    *out = (int64_t)value->valuedouble;
    return value->valuedouble == (double)*out;
}

static size_t base64url_decode(const char *input, uint8_t *output, size_t output_len)
{
    if (input == NULL || output == NULL) return 0;
    const size_t input_len = strlen(input);
    if (input_len == 0 || input_len > 256 || (input_len % 4U) == 1U) return 0;
    char normalized[260];
    memcpy(normalized, input, input_len);
    size_t normalized_len = input_len;
    for (size_t i = 0; i < normalized_len; ++i) {
        if (normalized[i] == '-') normalized[i] = '+';
        if (normalized[i] == '_') normalized[i] = '/';
    }
    while ((normalized_len % 4U) != 0U) normalized[normalized_len++] = '=';
    normalized[normalized_len] = '\0';
    size_t output_index = 0;
    for (size_t i = 0; i < normalized_len; i += 4U) {
        int values[4];
        for (size_t j = 0; j < 4U; ++j) {
            const char value = normalized[i + j];
            values[j] = value == '=' ? 0 :
                (value >= 'A' && value <= 'Z') ? value - 'A' :
                (value >= 'a' && value <= 'z') ? value - 'a' + 26 :
                (value >= '0' && value <= '9') ? value - '0' + 52 :
                value == '+' ? 62 : value == '/' ? 63 : -1;
            if (values[j] < 0) return 0;
        }
        if (output_index >= output_len) return 0;
        output[output_index++] = (uint8_t)((values[0] << 2) | (values[1] >> 4));
        if (normalized[i + 2] != '=') {
            if (output_index >= output_len) return 0;
            output[output_index++] = (uint8_t)((values[1] << 4) | (values[2] >> 2));
        }
        if (normalized[i + 3] != '=') {
            if (output_index >= output_len) return 0;
            output[output_index++] = (uint8_t)((values[2] << 6) | values[3]);
        }
    }
    return output_index;
}

static bool signature_matches(const char *claims, const char *signature)
{
    if (!s_psa_initialized) {
        if (psa_crypto_init() != PSA_SUCCESS) return false;
        s_psa_initialized = true;
    }
    uint8_t signature_bytes[128];
    const size_t signature_len = base64url_decode(signature, signature_bytes, sizeof(signature_bytes));
    if (signature_len == 0 || DEMO_SIGNING_PUBLIC_KEY_LEN == 0) return false;

    uint8_t digest[32];
    size_t digest_len = 0;
    if (psa_hash_compute(PSA_ALG_SHA_256, (const uint8_t *)claims, strlen(claims), digest, sizeof(digest), &digest_len) != PSA_SUCCESS ||
        digest_len != sizeof(digest)) return false;
    psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
    psa_set_key_type(&attributes, PSA_KEY_TYPE_ECC_PUBLIC_KEY(PSA_ECC_FAMILY_SECP_R1));
    psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_VERIFY_HASH);
    psa_set_key_algorithm(&attributes, PSA_ALG_ECDSA(PSA_ALG_SHA_256));
    psa_set_key_lifetime(&attributes, PSA_KEY_LIFETIME_VOLATILE);
    psa_key_id_t key_id = 0;
    const psa_status_t import_status = psa_import_key(&attributes, DEMO_SIGNING_PUBLIC_KEY, DEMO_SIGNING_PUBLIC_KEY_LEN, &key_id);
    psa_reset_key_attributes(&attributes);
    if (import_status != PSA_SUCCESS) return false;
    const psa_status_t verify_status = psa_verify_hash(key_id, PSA_ALG_ECDSA(PSA_ALG_SHA_256), digest, sizeof(digest), signature_bytes, signature_len);
    psa_destroy_key(key_id);
    return verify_status == PSA_SUCCESS;
}

grant_verify_result_t grant_verifier_verify(const lock_logic_context_t *lock_context,
                                            const uint8_t *payload,
                                            size_t payload_len,
                                            int64_t now_epoch)
{
    if (lock_context == NULL || payload == NULL || payload_len == 0 || payload_len > 4096) {
        return GRANT_VERIFY_BAD_PAYLOAD;
    }
    cJSON *envelope = cJSON_ParseWithLength((const char *)payload, payload_len);
    if (envelope == NULL) return GRANT_VERIFY_BAD_PAYLOAD;
    const cJSON *grant = cJSON_GetObjectItemCaseSensitive(envelope, "grant");
    const char *signature = json_string(envelope, "signature");
    grant_verify_result_t result = GRANT_VERIFY_BAD_PAYLOAD;
    char *claims = NULL;

    if (!cJSON_IsObject(grant) || !json_string_equals(envelope, "algorithm", "ES256") || signature == NULL) {
        goto cleanup;
    }
    if (!json_string_equals(grant, "key_id", DEMO_SIGNING_KEY_ID) ||
        !json_string_equals(grant, "tenant_id", DEMO_TENANT_ID) ||
        !json_string_equals(grant, "locker_id", DEMO_LOCKER_ID)) {
        result = GRANT_VERIFY_WRONG_DEVICE;
        goto cleanup;
    }

    const char *grant_id = json_string(grant, "grant_id");
    const char *request_id = json_string(grant, "request_id");
    const char *nonce = json_string(grant, "nonce");
    int64_t issued_at = 0;
    int64_t expires_at = 0;
    if (grant_id == NULL || request_id == NULL || nonce == NULL || strlen(grant_id) == 0 ||
        strlen(request_id) == 0 || strlen(nonce) == 0 || !json_integer(grant, "issued_at", &issued_at) ||
        !json_integer(grant, "expires_at", &expires_at) || expires_at <= issued_at || now_epoch < issued_at ||
        now_epoch >= expires_at || issued_at > now_epoch + 30) {
        result = GRANT_VERIFY_EXPIRED;
        goto cleanup;
    }
    if (strcmp(nonce, s_last_nonce) == 0) {
        result = GRANT_VERIFY_REPLAY;
        goto cleanup;
    }

    const cJSON *presence = cJSON_GetObjectItemCaseSensitive(grant, "required_presence_ids");
    if (!cJSON_IsArray(presence) || cJSON_GetArraySize(presence) < 2 || cJSON_GetArraySize(presence) > LOCK_LOGIC_MAX_SESSIONS) {
        result = GRANT_VERIFY_PRESENCE;
        goto cleanup;
    }
    cJSON *presence_id = NULL;
    cJSON_ArrayForEach(presence_id, presence) {
        if (!cJSON_IsString(presence_id) || !lock_logic_has_session_identifier(lock_context, presence_id->valuestring)) {
            result = GRANT_VERIFY_PRESENCE;
            goto cleanup;
        }
    }

    claims = cJSON_PrintUnformatted(grant);
    if (claims == NULL || !signature_matches(claims, signature)) {
        result = GRANT_VERIFY_BAD_SIGNATURE;
        goto cleanup;
    }
    strncpy(s_last_nonce, nonce, sizeof(s_last_nonce) - 1U);
    s_last_nonce[sizeof(s_last_nonce) - 1U] = '\0';
    result = GRANT_VERIFY_OK;

cleanup:
    if (claims != NULL) cJSON_free(claims);
    cJSON_Delete(envelope);
    ESP_LOGI(TAG, "grant verification result=%s", grant_verify_result_name(result));
    return result;
}

const char *grant_verify_result_name(grant_verify_result_t result)
{
    switch (result) {
    case GRANT_VERIFY_OK: return "accepted";
    case GRANT_VERIFY_BAD_PAYLOAD: return "bad_payload";
    case GRANT_VERIFY_BAD_SIGNATURE: return "bad_signature";
    case GRANT_VERIFY_WRONG_DEVICE: return "wrong_device";
    case GRANT_VERIFY_EXPIRED: return "expired";
    case GRANT_VERIFY_REPLAY: return "replay";
    case GRANT_VERIFY_PRESENCE: return "presence";
    default: return "unknown";
    }
}
