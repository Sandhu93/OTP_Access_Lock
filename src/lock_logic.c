#include "lock_logic.h"

#include <ctype.h>
#include <string.h>

// SECURITY-PLACEHOLDER: hardcoded simulated backend token for bench testing - must be replaced before production. See TODO_SECURITY_DEBT.md
static const char s_simulated_backend_token[] = "123456";

static lock_logic_result_t lock_logic_handle_message_internal(lock_logic_context_t *ctx,
                                                              uint16_t conn_handle,
                                                              const uint8_t *data,
                                                              size_t len,
                                                              uint32_t now_ms,
                                                              bool require_session);

static lock_logic_result_t make_result(lock_logic_context_t *ctx,
                                       lock_logic_response_t response,
                                       bool should_actuate)
{
    lock_logic_result_t result = {
        .state = ctx != NULL ? ctx->state : LOCK_LOGIC_STATE_IDLE,
        .response = response,
        .should_actuate = should_actuate,
    };
    return result;
}

static bool token_matches(const uint8_t *data, size_t len)
{
    const size_t token_len = strlen(s_simulated_backend_token);
    return len == token_len && memcmp(data, s_simulated_backend_token, token_len) == 0;
}

static void clear_request(lock_logic_context_t *ctx)
{
    ctx->state = LOCK_LOGIC_STATE_IDLE;
    ctx->request_started_ms = 0;
    ctx->requester_conn_handle = LOCK_LOGIC_INVALID_CONN_HANDLE;
    ctx->approver_conn_handle = LOCK_LOGIC_INVALID_CONN_HANDLE;
}

static lock_logic_session_t *find_session(lock_logic_context_t *ctx, uint16_t conn_handle)
{
    for (size_t i = 0; i < LOCK_LOGIC_MAX_SESSIONS; ++i) {
        if (ctx->sessions[i].active && ctx->sessions[i].conn_handle == conn_handle) {
            return &ctx->sessions[i];
        }
    }
    return NULL;
}

static const lock_logic_session_t *find_session_const(const lock_logic_context_t *ctx,
                                                       uint16_t conn_handle)
{
    for (size_t i = 0; i < LOCK_LOGIC_MAX_SESSIONS; ++i) {
        if (ctx->sessions[i].active && ctx->sessions[i].conn_handle == conn_handle) {
            return &ctx->sessions[i];
        }
    }
    return NULL;
}

static lock_logic_session_t *find_role_session(lock_logic_context_t *ctx, uint8_t role)
{
    for (size_t i = 0; i < LOCK_LOGIC_MAX_SESSIONS; ++i) {
        if (ctx->sessions[i].active && ctx->sessions[i].role == role) {
            return &ctx->sessions[i];
        }
    }
    return NULL;
}

static bool session_id_is_zero(const uint8_t *session_id)
{
    for (size_t i = 0; i < LOCK_LOGIC_SESSION_ID_LEN; ++i) {
        if (session_id[i] != 0) {
            return false;
        }
    }
    return true;
}

static lock_logic_session_t *allocate_session(lock_logic_context_t *ctx)
{
    for (size_t i = 0; i < LOCK_LOGIC_MAX_SESSIONS; ++i) {
        if (!ctx->sessions[i].active) {
            return &ctx->sessions[i];
        }
    }
    return NULL;
}

static lock_logic_result_t handle_session_open(lock_logic_context_t *ctx,
                                               uint16_t conn_handle,
                                               const uint8_t *payload,
                                               size_t payload_len,
                                               uint32_t now_ms)
{
    if (payload_len != 1U + LOCK_LOGIC_SESSION_ID_LEN ||
        (payload[0] != LOCK_LOGIC_ROLE_REQUESTER && payload[0] != LOCK_LOGIC_ROLE_APPROVER) ||
        session_id_is_zero(&payload[1])) {
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
    }

    lock_logic_session_t *existing = find_session(ctx, conn_handle);
    if (existing != NULL) {
        if (existing->role != payload[0] ||
            memcmp(existing->session_id, &payload[1], LOCK_LOGIC_SESSION_ID_LEN) != 0) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT, false);
        }
        existing->last_seen_ms = now_ms;
        return make_result(ctx, LOCK_LOGIC_RESPONSE_SESSION_OPENED, false);
    }

    if (find_role_session(ctx, payload[0]) != NULL) {
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT, false);
    }

    lock_logic_session_t *session = allocate_session(ctx);
    if (session == NULL) {
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT, false);
    }

    // SECURITY-PLACEHOLDER: role and session ID are accepted from the encrypted bench client without a signed backend grant - must be replaced before production. See TODO_SECURITY_DEBT.md
    memset(session, 0, sizeof(*session));
    session->active = true;
    session->conn_handle = conn_handle;
    session->role = payload[0];
    memcpy(session->session_id, &payload[1], LOCK_LOGIC_SESSION_ID_LEN);
    session->last_seen_ms = now_ms;
    return make_result(ctx, LOCK_LOGIC_RESPONSE_SESSION_OPENED, false);
}

void lock_logic_init(lock_logic_context_t *ctx)
{
    if (ctx == NULL) {
        return;
    }
    memset(ctx, 0, sizeof(*ctx));
    clear_request(ctx);
}

void lock_logic_reset(lock_logic_context_t *ctx)
{
    lock_logic_init(ctx);
}

static bool request_expired(const lock_logic_context_t *ctx, uint32_t now_ms)
{
    if (ctx == NULL || ctx->state != LOCK_LOGIC_STATE_REQUEST_PENDING) {
        return false;
    }
    return (uint32_t)(now_ms - ctx->request_started_ms) > LOCK_LOGIC_REQUEST_TIMEOUT_MS;
}

lock_logic_result_t lock_logic_handle_message(lock_logic_context_t *ctx,
                                              const uint8_t *data,
                                              size_t len)
{
    return lock_logic_handle_message_at(ctx, data, len, 0);
}

lock_logic_result_t lock_logic_handle_message_at(lock_logic_context_t *ctx,
                                                 const uint8_t *data,
                                                 size_t len,
                                                 uint32_t now_ms)
{
    return lock_logic_handle_message_internal(ctx,
                                              LOCK_LOGIC_INVALID_CONN_HANDLE,
                                              data,
                                              len,
                                              now_ms,
                                              false);
}

lock_logic_result_t lock_logic_handle_message_from(lock_logic_context_t *ctx,
                                                    uint16_t conn_handle,
                                                    const uint8_t *data,
                                                    size_t len)
{
    return lock_logic_handle_message_from_at(ctx, conn_handle, data, len, 0);
}

lock_logic_result_t lock_logic_handle_message_from_at(lock_logic_context_t *ctx,
                                                      uint16_t conn_handle,
                                                      const uint8_t *data,
                                                      size_t len,
                                                      uint32_t now_ms)
{
    return lock_logic_handle_message_internal(ctx, conn_handle, data, len, now_ms, true);
}

static lock_logic_result_t lock_logic_handle_message_internal(lock_logic_context_t *ctx,
                                                              uint16_t conn_handle,
                                                              const uint8_t *data,
                                                              size_t len,
                                                              uint32_t now_ms,
                                                              bool require_session)
{
    if (ctx == NULL) {
        return (lock_logic_result_t) {
            .state = LOCK_LOGIC_STATE_IDLE,
            .response = LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD,
            .should_actuate = false,
        };
    }

    if (data == NULL || len == 0) {
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_EMPTY, false);
    }
    if (len > LOCK_LOGIC_MAX_FRAME_LEN) {
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
    }
    if (request_expired(ctx, now_ms)) {
        clear_request(ctx);
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_TIMEOUT, false);
    }
    if (len < 2) {
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
    }
    if (data[0] != LOCK_LOGIC_PROTOCOL_VERSION) {
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_VERSION_UNSUPPORTED, false);
    }

    const uint8_t command = data[1];
    const uint8_t *payload = len > 2 ? &data[2] : NULL;
    const size_t payload_len = len > 2 ? len - 2 : 0;

    lock_logic_session_t *session = require_session ? find_session(ctx, conn_handle) : NULL;
    if (session != NULL) {
        session->last_seen_ms = now_ms;
    }

    switch (command) {
    case LOCK_LOGIC_CMD_OPEN_SESSION:
        if (!require_session || conn_handle == LOCK_LOGIC_INVALID_CONN_HANDLE) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED, false);
        }
        return handle_session_open(ctx, conn_handle, payload, payload_len, now_ms);

    case LOCK_LOGIC_CMD_SESSION_HEARTBEAT:
        if (payload_len != 0) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
        }
        if (require_session && session == NULL) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED, false);
        }
        return make_result(ctx, LOCK_LOGIC_RESPONSE_SESSION_ACTIVE, false);

    case LOCK_LOGIC_CMD_CLOSE_SESSION:
        if (payload_len != 0) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
        }
        if (require_session && session == NULL) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED, false);
        }
        if (require_session) {
            lock_logic_disconnect(ctx, conn_handle);
        }
        return make_result(ctx, LOCK_LOGIC_RESPONSE_SESSION_CLOSED, false);

    case LOCK_LOGIC_CMD_REQUEST_UNLOCK:
        if (payload_len != 0) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
        }
        if (require_session && (session == NULL || session->role != LOCK_LOGIC_ROLE_REQUESTER)) {
            return make_result(ctx,
                               session == NULL ? LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED
                                               : LOCK_LOGIC_RESPONSE_ERR_SESSION_ROLE,
                               false);
        }
        if (require_session && ctx->state == LOCK_LOGIC_STATE_REQUEST_PENDING &&
            ctx->requester_conn_handle != conn_handle) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT, false);
        }
        ctx->state = LOCK_LOGIC_STATE_REQUEST_PENDING;
        ctx->request_started_ms = now_ms;
        if (require_session) {
            ctx->requester_conn_handle = conn_handle;
        }
        return make_result(ctx, LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN, false);

    case LOCK_LOGIC_CMD_SUBMIT_TOKEN:
        if (require_session && (session == NULL || session->role != LOCK_LOGIC_ROLE_APPROVER)) {
            return make_result(ctx,
                               session == NULL ? LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED
                                               : LOCK_LOGIC_RESPONSE_ERR_SESSION_ROLE,
                               false);
        }
        if (ctx->state != LOCK_LOGIC_STATE_REQUEST_PENDING) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_TOKEN_REQUIRED, false);
        }
        if (require_session && find_session_const(ctx, ctx->requester_conn_handle) == NULL) {
            clear_request(ctx);
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED, false);
        }
        if (require_session) {
            ctx->approver_conn_handle = conn_handle;
        }
        if (payload_len == 0) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
        }
        if (payload_len > LOCK_LOGIC_MAX_TOKEN_LEN) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
        }
        if (!token_matches(payload, payload_len)) {
            clear_request(ctx);
            return make_result(ctx, LOCK_LOGIC_RESPONSE_UNLOCK_DENIED, false);
        }
        ctx->state = LOCK_LOGIC_STATE_TOKEN_ACCEPTED;
        ctx->state = LOCK_LOGIC_STATE_UNLOCKED_TEMPORARILY;
        ctx->request_started_ms = 0;
        return make_result(ctx, LOCK_LOGIC_RESPONSE_UNLOCK_OK, true);

    case LOCK_LOGIC_CMD_CANCEL:
        if (payload_len != 0) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, false);
        }
        if (require_session && session == NULL) {
            return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED, false);
        }
        clear_request(ctx);
        return make_result(ctx, LOCK_LOGIC_RESPONSE_LOCK_CANCELLED, false);

    default:
        return make_result(ctx, LOCK_LOGIC_RESPONSE_ERR_UNKNOWN_COMMAND, false);
    }
}

void lock_logic_disconnect(lock_logic_context_t *ctx, uint16_t conn_handle)
{
    if (ctx == NULL) {
        return;
    }

    lock_logic_session_t *session = find_session(ctx, conn_handle);
    if (session == NULL) {
        return;
    }

    const bool affected_request =
        ctx->state == LOCK_LOGIC_STATE_REQUEST_PENDING &&
        (ctx->requester_conn_handle == conn_handle || ctx->approver_conn_handle == conn_handle);

    memset(session, 0, sizeof(*session));
    if (affected_request) {
        clear_request(ctx);
    }
}

bool lock_logic_has_session_identifier(const lock_logic_context_t *ctx, const char *identifier)
{
    if (ctx == NULL || identifier == NULL || strlen(identifier) != LOCK_LOGIC_SESSION_ID_LEN * 2U) {
        return false;
    }

    uint8_t expected[LOCK_LOGIC_SESSION_ID_LEN] = {0};
    for (size_t i = 0; i < LOCK_LOGIC_SESSION_ID_LEN; ++i) {
        const char high = (char)tolower((unsigned char)identifier[i * 2U]);
        const char low = (char)tolower((unsigned char)identifier[i * 2U + 1U]);
        if (!isxdigit((unsigned char)high) || !isxdigit((unsigned char)low)) {
            return false;
        }
        expected[i] = (uint8_t)((isdigit((unsigned char)high) ? high - '0' : high - 'a' + 10) << 4U);
        expected[i] |= (uint8_t)(isdigit((unsigned char)low) ? low - '0' : low - 'a' + 10);
    }

    for (size_t i = 0; i < LOCK_LOGIC_MAX_SESSIONS; ++i) {
        if (ctx->sessions[i].active && memcmp(ctx->sessions[i].session_id, expected, sizeof(expected)) == 0) {
            return true;
        }
    }
    return false;
}

const char *lock_logic_state_name(lock_logic_state_t state)
{
    switch (state) {
    case LOCK_LOGIC_STATE_IDLE:
        return "IDLE";
    case LOCK_LOGIC_STATE_REQUEST_PENDING:
        return "REQUEST_PENDING";
    case LOCK_LOGIC_STATE_TOKEN_ACCEPTED:
        return "TOKEN_ACCEPTED";
    case LOCK_LOGIC_STATE_UNLOCKED_TEMPORARILY:
        return "UNLOCKED_TEMPORARILY";
    default:
        return "UNKNOWN";
    }
}

const char *lock_logic_response_name(lock_logic_response_t response)
{
    switch (response) {
    case LOCK_LOGIC_RESPONSE_LOCK_IDLE:
        return "LOCK_IDLE";
    case LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN:
        return "LOCK_WAITING_TOKEN";
    case LOCK_LOGIC_RESPONSE_UNLOCK_OK:
        return "UNLOCK_OK";
    case LOCK_LOGIC_RESPONSE_UNLOCK_DENIED:
        return "UNLOCK_DENIED";
    case LOCK_LOGIC_RESPONSE_LOCK_CANCELLED:
        return "LOCK_CANCELLED";
    case LOCK_LOGIC_RESPONSE_LOCK_RESET:
        return "LOCK_RESET";
    case LOCK_LOGIC_RESPONSE_ERR_EMPTY:
        return "ERR_EMPTY";
    case LOCK_LOGIC_RESPONSE_ERR_UNKNOWN_COMMAND:
        return "ERR_UNKNOWN_COMMAND";
    case LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD:
        return "ERR_BAD_PAYLOAD";
    case LOCK_LOGIC_RESPONSE_ERR_TOKEN_REQUIRED:
        return "ERR_TOKEN_REQUIRED";
    case LOCK_LOGIC_RESPONSE_ERR_VERSION_UNSUPPORTED:
        return "ERR_VERSION_UNSUPPORTED";
    case LOCK_LOGIC_RESPONSE_ERR_TIMEOUT:
        return "ERR_TIMEOUT";
    case LOCK_LOGIC_RESPONSE_ERR_UNENCRYPTED:
        return "ERR_UNENCRYPTED";
    case LOCK_LOGIC_RESPONSE_SESSION_OPENED:
        return "SESSION_OPENED";
    case LOCK_LOGIC_RESPONSE_SESSION_ACTIVE:
        return "SESSION_ACTIVE";
    case LOCK_LOGIC_RESPONSE_SESSION_CLOSED:
        return "SESSION_CLOSED";
    case LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED:
        return "ERR_SESSION_REQUIRED";
    case LOCK_LOGIC_RESPONSE_ERR_SESSION_ROLE:
        return "ERR_SESSION_ROLE";
    case LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT:
        return "ERR_SESSION_CONFLICT";
    default:
        return "ERR_UNKNOWN_RESPONSE";
    }
}

uint8_t lock_logic_response_code(lock_logic_response_t response)
{
    switch (response) {
    case LOCK_LOGIC_RESPONSE_LOCK_IDLE:
        return 0x10;
    case LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN:
        return 0x11;
    case LOCK_LOGIC_RESPONSE_UNLOCK_OK:
        return 0x12;
    case LOCK_LOGIC_RESPONSE_UNLOCK_DENIED:
        return 0x13;
    case LOCK_LOGIC_RESPONSE_LOCK_CANCELLED:
        return 0x14;
    case LOCK_LOGIC_RESPONSE_LOCK_RESET:
        return 0x15;
    case LOCK_LOGIC_RESPONSE_ERR_EMPTY:
        return 0x80;
    case LOCK_LOGIC_RESPONSE_ERR_UNKNOWN_COMMAND:
        return 0x81;
    case LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD:
        return 0x82;
    case LOCK_LOGIC_RESPONSE_ERR_TOKEN_REQUIRED:
        return 0x83;
    case LOCK_LOGIC_RESPONSE_ERR_VERSION_UNSUPPORTED:
        return 0x84;
    case LOCK_LOGIC_RESPONSE_ERR_TIMEOUT:
        return 0x85;
    case LOCK_LOGIC_RESPONSE_ERR_UNENCRYPTED:
        return 0x86;
    case LOCK_LOGIC_RESPONSE_SESSION_OPENED:
        return 0x16;
    case LOCK_LOGIC_RESPONSE_SESSION_ACTIVE:
        return 0x17;
    case LOCK_LOGIC_RESPONSE_SESSION_CLOSED:
        return 0x18;
    case LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED:
        return 0x87;
    case LOCK_LOGIC_RESPONSE_ERR_SESSION_ROLE:
        return 0x88;
    case LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT:
        return 0x89;
    default:
        return 0xFF;
    }
}

size_t lock_logic_format_response(lock_logic_response_t response, uint8_t *out, size_t out_len)
{
    if (out == NULL || out_len == 0) {
        return 0;
    }

    out[0] = LOCK_LOGIC_PROTOCOL_VERSION;
    if (out_len == 1) {
        return 1;
    }

    out[1] = lock_logic_response_code(response);
    if (out_len == LOCK_LOGIC_RESPONSE_HEADER_LEN) {
        return LOCK_LOGIC_RESPONSE_HEADER_LEN;
    }

    const char *name = lock_logic_response_name(response);
    const size_t name_len = strlen(name);
    const size_t available_text_len = out_len - LOCK_LOGIC_RESPONSE_HEADER_LEN;
    const size_t copy_len = name_len < available_text_len ? name_len : available_text_len;

    memcpy(&out[LOCK_LOGIC_RESPONSE_HEADER_LEN], name, copy_len);
    return LOCK_LOGIC_RESPONSE_HEADER_LEN + copy_len;
}
