#ifndef BLE_SERVICE_H
#define BLE_SERVICE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

typedef size_t (*ble_service_write_cb_t)(uint16_t conn_handle,
                                         const uint8_t *data,
                                         size_t len,
                                         bool link_encrypted,
                                         uint8_t *response,
                                         size_t response_len,
                                         bool *should_actuate);
typedef void (*ble_service_disconnect_cb_t)(uint16_t conn_handle);

esp_err_t ble_service_start(ble_service_write_cb_t write_cb,
                            ble_service_disconnect_cb_t disconnect_cb);

#endif
