#include "ble_service.h"

#include <stdio.h>
#include <string.h>

#include "ble_protocol.h"
#include "esp_log.h"
#include "esp_err.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "host/ble_hs.h"
#include "host/ble_sm.h"
#include "host/ble_uuid.h"
#include "host/util/util.h"
#include "nimble/ble.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "os/os_mbuf.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

void ble_store_config_init(void);

static const char *TAG = "BLE_SERVICE";

// SECURITY-PLACEHOLDER: temporary bench-test UUIDs - must be replaced before production. See TODO_SECURITY_DEBT.md
static const ble_uuid128_t s_lock_service_uuid =
    BLE_UUID128_INIT(0x01, 0x00, 0x5F, 0x7A, 0x9B, 0x2E, 0x2C, 0x8F,
                     0xCA, 0x45, 0xBD, 0xF7, 0x8A, 0xA2, 0x2E, 0x7D);

// SECURITY-PLACEHOLDER: temporary bench-test UUIDs - must be replaced before production. See TODO_SECURITY_DEBT.md
static const ble_uuid128_t s_echo_char_uuid =
    BLE_UUID128_INIT(0x02, 0x00, 0x5F, 0x7A, 0x9B, 0x2E, 0x2C, 0x8F,
                     0xCA, 0x45, 0xBD, 0xF7, 0x8A, 0xA2, 0x2E, 0x7D);

static uint16_t s_echo_value_handle;
static bool s_started;
static ble_service_write_cb_t s_write_cb;
static ble_service_disconnect_cb_t s_disconnect_cb;

#ifndef CONFIG_BT_NIMBLE_MAX_CONNECTIONS
#define CONFIG_BT_NIMBLE_MAX_CONNECTIONS 3
#endif

typedef struct {
    bool in_use;
    uint16_t conn_handle;
    bool encrypted;
    bool notifications_enabled;
    uint8_t last_response[BLE_PROTOCOL_MAX_PAYLOAD_LEN];
    size_t last_response_len;
} ble_service_connection_t;

static ble_service_connection_t s_connections[CONFIG_BT_NIMBLE_MAX_CONNECTIONS];

static int ble_service_gap_event(struct ble_gap_event *event, void *arg);
static void ble_service_advertise(void);

static int ble_service_access(uint16_t conn_handle, uint16_t attr_handle,
                              struct ble_gatt_access_ctxt *ctxt, void *arg);
static bool ble_service_link_encrypted(uint16_t conn_handle);
static ble_service_connection_t *ble_service_find_connection(uint16_t conn_handle);
static ble_service_connection_t *ble_service_add_connection(uint16_t conn_handle);
static void ble_service_remove_connection(uint16_t conn_handle);

static const struct ble_gatt_svc_def s_gatt_services[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &s_lock_service_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid = &s_echo_char_uuid.u,
                .access_cb = ble_service_access,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_NOTIFY,
                .val_handle = &s_echo_value_handle,
            },
            {0},
        },
    },
    {0},
};

static void ble_service_format_addr(char *out, size_t out_len, const uint8_t addr[6])
{
    if (out == NULL || out_len < 18 || addr == NULL) {
        return;
    }
    snprintf(out, out_len, "%02X:%02X:%02X:%02X:%02X:%02X",
             addr[5], addr[4], addr[3], addr[2], addr[1], addr[0]);
}

static void ble_service_log_conn_desc(uint16_t conn_handle)
{
    struct ble_gap_conn_desc desc;
    char peer[18] = {0};

    const int rc = ble_gap_conn_find(conn_handle, &desc);
    if (rc != 0) {
        ESP_LOGW(TAG, "Connection descriptor unavailable: conn_handle=%u rc=%d", conn_handle, rc);
        return;
    }

    ble_service_format_addr(peer, sizeof(peer), desc.peer_id_addr.val);
    ESP_LOGI(TAG, "Peer: handle=%u addr_type=%u addr=%s encrypted=%u authenticated=%u bonded=%u",
             conn_handle,
             desc.peer_id_addr.type,
             peer,
             desc.sec_state.encrypted,
             desc.sec_state.authenticated,
             desc.sec_state.bonded);
}

static bool ble_service_link_encrypted(uint16_t conn_handle)
{
    struct ble_gap_conn_desc desc;
    const int rc = ble_gap_conn_find(conn_handle, &desc);
    if (rc != 0) {
        ESP_LOGW(TAG, "Connection descriptor unavailable for security check: conn_handle=%u rc=%d",
                 conn_handle, rc);
        return false;
    }
    return desc.sec_state.encrypted != 0;
}

static ble_service_connection_t *ble_service_find_connection(uint16_t conn_handle)
{
    for (size_t i = 0; i < CONFIG_BT_NIMBLE_MAX_CONNECTIONS; ++i) {
        if (s_connections[i].in_use && s_connections[i].conn_handle == conn_handle) {
            return &s_connections[i];
        }
    }
    return NULL;
}

static ble_service_connection_t *ble_service_add_connection(uint16_t conn_handle)
{
    ble_service_connection_t *existing = ble_service_find_connection(conn_handle);
    if (existing != NULL) {
        return existing;
    }

    for (size_t i = 0; i < CONFIG_BT_NIMBLE_MAX_CONNECTIONS; ++i) {
        if (!s_connections[i].in_use) {
            memset(&s_connections[i], 0, sizeof(s_connections[i]));
            s_connections[i].in_use = true;
            s_connections[i].conn_handle = conn_handle;
            return &s_connections[i];
        }
    }
    return NULL;
}

static void ble_service_remove_connection(uint16_t conn_handle)
{
    ble_service_connection_t *connection = ble_service_find_connection(conn_handle);
    if (connection != NULL) {
        memset(connection, 0, sizeof(*connection));
    }
}

static int ble_service_notify(uint16_t conn_handle, const uint8_t *data, size_t len)
{
    ble_service_connection_t *connection = ble_service_find_connection(conn_handle);
    if (connection == NULL || !connection->notifications_enabled ||
        conn_handle == BLE_HS_CONN_HANDLE_NONE || data == NULL || len == 0) {
        return 0;
    }

    struct os_mbuf *om = ble_hs_mbuf_from_flat(data, len);
    if (om == NULL) {
        ESP_LOGE(TAG, "Failed to allocate notification buffer");
        return BLE_ATT_ERR_INSUFFICIENT_RES;
    }

    const int rc = ble_gatts_notify_custom(conn_handle, s_echo_value_handle, om);
    if (rc != 0) {
        ESP_LOGE(TAG, "Notify failed: conn_handle=%u rc=%d", conn_handle, rc);
    } else {
        ESP_LOGI(TAG, "GATT response notification queued: conn_handle=%u len=%zu",
                 conn_handle, len);
    }
    return rc;
}

static int ble_service_access(uint16_t conn_handle, uint16_t attr_handle,
                              struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    ble_service_connection_t *connection = ble_service_find_connection(conn_handle);
    if (connection == NULL) {
        ESP_LOGW(TAG, "Ignoring GATT access from unknown connection: conn_handle=%u", conn_handle);
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (attr_handle != s_echo_value_handle) {
        return BLE_ATT_ERR_UNLIKELY;
    }

    switch (ctxt->op) {
    case BLE_GATT_ACCESS_OP_READ_CHR: {
        ESP_LOGI(TAG, "GATT read: conn_handle=%u attr_handle=%u len=%zu",
                 conn_handle, attr_handle, connection->last_response_len);
        const int rc = os_mbuf_append(ctxt->om,
                                      connection->last_response,
                                      connection->last_response_len);
        return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }

    case BLE_GATT_ACCESS_OP_WRITE_CHR: {
        uint8_t incoming[BLE_PROTOCOL_MAX_PAYLOAD_LEN + 1] = {0};
        uint16_t incoming_len = 0;
        int rc = ble_hs_mbuf_to_flat(ctxt->om, incoming, sizeof(incoming), &incoming_len);
        if (rc != 0) {
            ESP_LOGE(TAG, "GATT write flatten failed: rc=%d", rc);
            return BLE_ATT_ERR_UNLIKELY;
        }

        const ble_protocol_payload_status_t status =
            ble_protocol_validate_payload(incoming, incoming_len);
        if (status == BLE_PROTOCOL_PAYLOAD_EMPTY) {
            ESP_LOGW(TAG, "Ignoring empty GATT write");
            return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        }
        if (status == BLE_PROTOCOL_PAYLOAD_TOO_LARGE) {
            ESP_LOGW(TAG, "Rejecting oversized GATT write: len=%u max=%u",
                     incoming_len, BLE_PROTOCOL_MAX_PAYLOAD_LEN);
            return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        }
        if (status != BLE_PROTOCOL_PAYLOAD_OK) {
            ESP_LOGE(TAG, "Invalid GATT write payload: status=%d", status);
            return BLE_ATT_ERR_UNLIKELY;
        }

        const uint8_t version = incoming[0];
        const uint8_t command = incoming_len > 1 ? incoming[1] : 0xFF;
        ESP_LOGI(TAG, "GATT write: conn_handle=%u attr_handle=%u version=0x%02X command=0x%02X len=%zu",
                 conn_handle, attr_handle, version, command, (size_t)incoming_len);

        bool should_actuate = false;
        const bool link_encrypted = ble_service_link_encrypted(conn_handle);
        if (!link_encrypted) {
            ESP_LOGW(TAG, "Rejecting command on unencrypted BLE link: conn_handle=%u", conn_handle);
        }
        if (s_write_cb != NULL) {
            connection->last_response_len = s_write_cb(conn_handle,
                                                       incoming,
                                                       incoming_len,
                                                       link_encrypted,
                                                       connection->last_response,
                                                       sizeof(connection->last_response),
                                                       &should_actuate);
        } else {
            static const uint8_t no_handler[] = "ERR_NO_HANDLER";
            connection->last_response_len = ble_protocol_prepare_echo(no_handler,
                                                                       sizeof(no_handler) - 1,
                                                                       connection->last_response,
                                                                       sizeof(connection->last_response));
        }

        ESP_LOGI(TAG, "GATT response: conn_handle=%u len=%zu encrypted=%d actuate=%d",
                 conn_handle, connection->last_response_len, link_encrypted, should_actuate);

        rc = ble_service_notify(conn_handle,
                                connection->last_response,
                                connection->last_response_len);
        return rc == 0 ? 0 : BLE_ATT_ERR_UNLIKELY;
    }

    default:
        return BLE_ATT_ERR_UNLIKELY;
    }
}

static void ble_service_register_cb(struct ble_gatt_register_ctxt *ctxt, void *arg)
{
    char uuid[BLE_UUID_STR_LEN] = {0};

    switch (ctxt->op) {
    case BLE_GATT_REGISTER_OP_SVC:
        ESP_LOGD(TAG, "Registered service %s handle=%u",
                 ble_uuid_to_str(ctxt->svc.svc_def->uuid, uuid), ctxt->svc.handle);
        break;
    case BLE_GATT_REGISTER_OP_CHR:
        ESP_LOGD(TAG, "Registered characteristic %s def_handle=%u val_handle=%u",
                 ble_uuid_to_str(ctxt->chr.chr_def->uuid, uuid),
                 ctxt->chr.def_handle,
                 ctxt->chr.val_handle);
        break;
    default:
        break;
    }
}

static int ble_service_gatt_init(void)
{
    ble_svc_gatt_init();

    int rc = ble_gatts_count_cfg(s_gatt_services);
    if (rc != 0) {
        return rc;
    }

    return ble_gatts_add_svcs(s_gatt_services);
}

static int ble_service_gap_init(void)
{
    ble_svc_gap_init();

    const int rc = ble_svc_gap_device_name_set(BLE_PROTOCOL_DEVICE_NAME);
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to set BLE device name: rc=%d", rc);
        return rc;
    }
    return 0;
}

static void ble_service_security_init(void)
{
    // SECURITY-PLACEHOLDER: Just Works BLE encryption is MVP scaffolding, not mutual authentication - must be replaced before production. See TODO_SECURITY_DEBT.md
    ble_hs_cfg.sm_io_cap = BLE_SM_IO_CAP_NO_IO;
    ble_hs_cfg.sm_bonding = 1;
    ble_hs_cfg.sm_mitm = 0;
    ble_hs_cfg.sm_sc = 1;
    ble_hs_cfg.sm_our_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
    ble_hs_cfg.sm_their_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
}

static void ble_service_advertise(void)
{
    uint8_t own_addr_type = 0;
    int rc = ble_hs_id_infer_auto(0, &own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to infer BLE address type: rc=%d", rc);
        return;
    }

    struct ble_hs_adv_fields fields = {0};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.tx_pwr_lvl_is_present = 1;
    fields.tx_pwr_lvl = BLE_HS_ADV_TX_PWR_LVL_AUTO;
    fields.name = (uint8_t *)BLE_PROTOCOL_DEVICE_NAME;
    fields.name_len = strlen(BLE_PROTOCOL_DEVICE_NAME);
    fields.name_is_complete = 1;

    rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to set BLE advertising fields: rc=%d", rc);
        return;
    }

    struct ble_hs_adv_fields response_fields = {0};
    response_fields.uuids128 = (ble_uuid128_t *)&s_lock_service_uuid;
    response_fields.num_uuids128 = 1;
    response_fields.uuids128_is_complete = 1;

    rc = ble_gap_adv_rsp_set_fields(&response_fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to set BLE scan response fields: rc=%d", rc);
        return;
    }

    struct ble_gap_adv_params params = {0};
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    params.itvl_min = BLE_GAP_ADV_ITVL_MS(100);
    params.itvl_max = BLE_GAP_ADV_ITVL_MS(120);

    rc = ble_gap_adv_start(own_addr_type, NULL, BLE_HS_FOREVER,
                           &params, ble_service_gap_event, NULL);
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to start BLE advertising: rc=%d", rc);
        return;
    }

    ESP_LOGI(TAG, "Advertising as %s", BLE_PROTOCOL_DEVICE_NAME);
}

static int ble_service_gap_event(struct ble_gap_event *event, void *arg)
{
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        ESP_LOGI(TAG, "BLE connect event: status=%d conn_handle=%u",
                 event->connect.status, event->connect.conn_handle);
        if (event->connect.status == 0) {
            if (ble_service_add_connection(event->connect.conn_handle) == NULL) {
                ESP_LOGW(TAG, "Rejecting BLE connection because the session table is full: conn_handle=%u",
                         event->connect.conn_handle);
                (void)ble_gap_terminate(event->connect.conn_handle, BLE_ERR_REM_USER_CONN_TERM);
                ble_service_advertise();
                return 0;
            }
            ble_service_log_conn_desc(event->connect.conn_handle);
            const int rc = ble_gap_security_initiate(event->connect.conn_handle);
            if (rc != 0) {
                ESP_LOGW(TAG, "BLE security initiate failed: conn_handle=%u rc=%d",
                         event->connect.conn_handle, rc);
            } else {
                ESP_LOGI(TAG, "BLE security initiate requested: conn_handle=%u",
                         event->connect.conn_handle);
            }
            // NimBLE stops the current advertising procedure when a central connects.
            // Restart it so a second enrolled phone can discover the same lock.
            ble_service_advertise();
        } else {
            ble_service_advertise();
        }
        return 0;

    case BLE_GAP_EVENT_DISCONNECT: {
        ESP_LOGI(TAG, "BLE disconnect event: reason=%d", event->disconnect.reason);
        const uint16_t disconnected_handle = event->disconnect.conn.conn_handle;
        if (s_disconnect_cb != NULL) {
            s_disconnect_cb(disconnected_handle);
        }
        ble_service_remove_connection(disconnected_handle);
        ble_service_advertise();
        return 0;
    }

    case BLE_GAP_EVENT_SUBSCRIBE:
        {
            ble_service_connection_t *connection =
                ble_service_find_connection(event->subscribe.conn_handle);
            if (connection != NULL) {
                connection->notifications_enabled =
                    ble_protocol_notifications_enabled(event->subscribe.cur_notify,
                                                       event->subscribe.cur_indicate);
            }
        }
        ESP_LOGI(TAG, "BLE subscribe event: conn_handle=%u attr_handle=%u notify=%d indicate=%d",
                 event->subscribe.conn_handle,
                 event->subscribe.attr_handle,
                 event->subscribe.cur_notify,
                 event->subscribe.cur_indicate);
        return 0;

    case BLE_GAP_EVENT_NOTIFY_TX:
        ESP_LOGI(TAG, "BLE notify_tx event: conn_handle=%u attr_handle=%u status=%d",
                 event->notify_tx.conn_handle,
                 event->notify_tx.attr_handle,
                 event->notify_tx.status);
        return 0;

    case BLE_GAP_EVENT_ADV_COMPLETE:
        ESP_LOGI(TAG, "BLE advertising complete: reason=%d", event->adv_complete.reason);
        ble_service_advertise();
        return 0;

    case BLE_GAP_EVENT_MTU:
        ESP_LOGI(TAG, "BLE MTU event: conn_handle=%u mtu=%u",
                 event->mtu.conn_handle, event->mtu.value);
        return 0;

    case BLE_GAP_EVENT_ENC_CHANGE:
        {
            ble_service_connection_t *connection =
                ble_service_find_connection(event->enc_change.conn_handle);
            if (connection != NULL) {
                connection->encrypted = ble_service_link_encrypted(event->enc_change.conn_handle);
            }
        }
        ESP_LOGI(TAG, "BLE encryption change: status=%d conn_handle=%u encrypted=%d",
                 event->enc_change.status,
                 event->enc_change.conn_handle,
                 ble_service_link_encrypted(event->enc_change.conn_handle));
        return 0;

    case BLE_GAP_EVENT_REPEAT_PAIRING:
        ESP_LOGW(TAG, "BLE repeat pairing event: conn_handle=%u", event->repeat_pairing.conn_handle);
        return BLE_GAP_REPEAT_PAIRING_RETRY;

    default:
        ESP_LOGD(TAG, "Unhandled BLE GAP event: type=%d", event->type);
        return 0;
    }
}

static void ble_service_on_reset(int reason)
{
    ESP_LOGE(TAG, "NimBLE host reset: reason=%d", reason);
}

static void ble_service_on_sync(void)
{
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to ensure BLE address: rc=%d", rc);
        return;
    }
    ble_service_advertise();
}

static void ble_service_host_task(void *param)
{
    ESP_LOGI(TAG, "NimBLE host task started");
    nimble_port_run();
    nimble_port_freertos_deinit();
}

static esp_err_t ble_service_init_nvs(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    return err;
}

esp_err_t ble_service_start(ble_service_write_cb_t write_cb,
                            ble_service_disconnect_cb_t disconnect_cb)
{
    if (s_started) {
        return ESP_ERR_INVALID_STATE;
    }

    ESP_LOGI(TAG, "Starting BLE GATT peripheral");
    s_write_cb = write_cb;
    s_disconnect_cb = disconnect_cb;

    esp_err_t err = ble_service_init_nvs();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS init failed: %s", esp_err_to_name(err));
        return err;
    }

    err = nimble_port_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NimBLE init failed: %s", esp_err_to_name(err));
        return err;
    }

    int rc = ble_service_gap_init();
    if (rc != 0) {
        ESP_LOGE(TAG, "GAP init failed: rc=%d", rc);
        return ESP_FAIL;
    }

    rc = ble_service_gatt_init();
    if (rc != 0) {
        ESP_LOGE(TAG, "GATT init failed: rc=%d", rc);
        return ESP_FAIL;
    }

    ble_hs_cfg.reset_cb = ble_service_on_reset;
    ble_hs_cfg.sync_cb = ble_service_on_sync;
    ble_hs_cfg.gatts_register_cb = ble_service_register_cb;
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
    ble_service_security_init();
    ble_store_config_init();

    nimble_port_freertos_init(ble_service_host_task);
    s_started = true;
    return ESP_OK;
}
