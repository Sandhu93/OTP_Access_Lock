#include "ble_protocol.h"

#include <string.h>

const char *ble_protocol_event_name(ble_protocol_event_t event)
{
    switch (event) {
    case BLE_PROTOCOL_EVENT_CONNECT:
        return "connect";
    case BLE_PROTOCOL_EVENT_DISCONNECT:
        return "disconnect";
    case BLE_PROTOCOL_EVENT_READ:
        return "read";
    case BLE_PROTOCOL_EVENT_WRITE:
        return "write";
    case BLE_PROTOCOL_EVENT_SUBSCRIBE:
        return "subscribe";
    case BLE_PROTOCOL_EVENT_NOTIFY_TX:
        return "notify_tx";
    case BLE_PROTOCOL_EVENT_UNKNOWN:
    default:
        return "unknown";
    }
}

ble_protocol_payload_status_t ble_protocol_validate_payload(const uint8_t *data, size_t len)
{
    if (data == NULL && len > 0) {
        return BLE_PROTOCOL_PAYLOAD_INVALID_ARG;
    }
    if (len == 0) {
        return BLE_PROTOCOL_PAYLOAD_EMPTY;
    }
    if (len > BLE_PROTOCOL_MAX_PAYLOAD_LEN) {
        return BLE_PROTOCOL_PAYLOAD_TOO_LARGE;
    }
    return BLE_PROTOCOL_PAYLOAD_OK;
}

size_t ble_protocol_prepare_echo(const uint8_t *input, size_t input_len, uint8_t *output, size_t output_len)
{
    if (input == NULL || output == NULL || output_len == 0) {
        return 0;
    }

    const size_t copy_len = input_len < output_len ? input_len : output_len;
    memcpy(output, input, copy_len);
    return copy_len;
}

size_t ble_protocol_format_hex(const uint8_t *data, size_t len, char *out, size_t out_len)
{
    static const char hex[] = "0123456789ABCDEF";
    size_t offset = 0;

    if (out == NULL || out_len == 0) {
        return 0;
    }
    out[0] = '\0';
    if (data == NULL || len == 0) {
        return 0;
    }

    for (size_t i = 0; i < len; ++i) {
        const char chars[3] = {
            hex[(data[i] >> 4) & 0x0F],
            hex[data[i] & 0x0F],
            ' ',
        };
        const size_t chars_to_write = (i + 1 < len) ? sizeof(chars) : 2;

        for (size_t j = 0; j < chars_to_write; ++j) {
            if (offset + 1 >= out_len) {
                out[out_len - 1] = '\0';
                return out_len - 1;
            }
            out[offset++] = chars[j];
        }
    }

    out[offset] = '\0';
    return offset;
}

bool ble_protocol_notifications_enabled(bool notify_enabled, bool indicate_enabled)
{
    return notify_enabled || indicate_enabled;
}
