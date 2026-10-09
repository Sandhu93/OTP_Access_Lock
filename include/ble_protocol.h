#ifndef BLE_PROTOCOL_H
#define BLE_PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define BLE_PROTOCOL_DEVICE_NAME "LOCK-TEST-01"
#define BLE_PROTOCOL_MAX_PAYLOAD_LEN 128

typedef enum {
    BLE_PROTOCOL_EVENT_CONNECT = 0,
    BLE_PROTOCOL_EVENT_DISCONNECT,
    BLE_PROTOCOL_EVENT_READ,
    BLE_PROTOCOL_EVENT_WRITE,
    BLE_PROTOCOL_EVENT_SUBSCRIBE,
    BLE_PROTOCOL_EVENT_NOTIFY_TX,
    BLE_PROTOCOL_EVENT_UNKNOWN,
} ble_protocol_event_t;

typedef enum {
    BLE_PROTOCOL_PAYLOAD_OK = 0,
    BLE_PROTOCOL_PAYLOAD_EMPTY,
    BLE_PROTOCOL_PAYLOAD_TOO_LARGE,
    BLE_PROTOCOL_PAYLOAD_INVALID_ARG,
} ble_protocol_payload_status_t;

const char *ble_protocol_event_name(ble_protocol_event_t event);
ble_protocol_payload_status_t ble_protocol_validate_payload(const uint8_t *data, size_t len);
size_t ble_protocol_prepare_echo(const uint8_t *input, size_t input_len, uint8_t *output, size_t output_len);
size_t ble_protocol_format_hex(const uint8_t *data, size_t len, char *out, size_t out_len);
bool ble_protocol_notifications_enabled(bool notify_enabled, bool indicate_enabled);

#endif
