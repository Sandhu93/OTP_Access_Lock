#ifndef DEVICE_GATEWAY_H
#define DEVICE_GATEWAY_H

#include "esp_err.h"

#include "lock_logic.h"

typedef void (*device_gateway_actuate_cb_t)(void);

esp_err_t device_gateway_start(lock_logic_context_t *lock_context,
                               device_gateway_actuate_cb_t actuate_callback);

#endif
