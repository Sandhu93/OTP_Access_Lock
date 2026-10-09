#include "led_control.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "LED_CONTROL";

#define LED_STATUS_GPIO GPIO_NUM_4
#define LED_ACTUATOR_GPIO GPIO_NUM_5

static bool led_is_supported_pin(gpio_num_t pin)
{
    return pin == LED_STATUS_GPIO || pin == LED_ACTUATOR_GPIO;
}

esp_err_t led_init(void)
{
    ESP_LOGI(TAG, "Initializing outputs: GPIO4=status LED, GPIO5=active-low relay (locked idle ON)");

    const gpio_config_t config = {
        .pin_bit_mask = (1ULL << LED_STATUS_GPIO) | (1ULL << LED_ACTUATOR_GPIO),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };

    esp_err_t err = gpio_config(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "gpio_config failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_ERROR_CHECK_WITHOUT_ABORT(led_set(LED_STATUS_GPIO, false));
    /* Reported lock behavior: energized relay holds the mechanism locked. */
    ESP_ERROR_CHECK_WITHOUT_ABORT(gpio_set_level(LED_ACTUATOR_GPIO, 0));
    ESP_LOGI(TAG, "GPIO init complete; relay energized to hold lock locked");
    return ESP_OK;
}

esp_err_t led_set(gpio_num_t pin, bool on)
{
    if (!led_is_supported_pin(pin)) {
        ESP_LOGE(TAG, "Unsupported LED GPIO: %d", pin);
        return ESP_ERR_INVALID_ARG;
    }

    const int level = pin == LED_ACTUATOR_GPIO ? (on ? 0 : 1) : (on ? 1 : 0);
    esp_err_t err = gpio_set_level(pin, level);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "gpio_set_level GPIO%d failed: %s", pin, esp_err_to_name(err));
    }
    return err;
}

esp_err_t led_blink(gpio_num_t pin, int times, int delay_ms)
{
    if (!led_is_supported_pin(pin) || times < 0 || delay_ms < 0) {
        ESP_LOGE(TAG, "Invalid blink request: GPIO%d times=%d delay_ms=%d", pin, times, delay_ms);
        return ESP_ERR_INVALID_ARG;
    }

    for (int i = 0; i < times; ++i) {
        esp_err_t err = led_set(pin, true);
        if (err != ESP_OK) {
            return err;
        }
        vTaskDelay(pdMS_TO_TICKS(delay_ms));

        err = led_set(pin, false);
        if (err != ESP_OK) {
            return err;
        }
        vTaskDelay(pdMS_TO_TICKS(delay_ms));
    }

    return ESP_OK;
}
