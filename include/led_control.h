#ifndef LED_CONTROL_H
#define LED_CONTROL_H

#include <stdbool.h>

#include "driver/gpio.h"
#include "esp_err.h"

esp_err_t led_init(void);
esp_err_t led_set(gpio_num_t pin, bool on);
esp_err_t led_blink(gpio_num_t pin, int times, int delay_ms);

#endif
