#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// SECURITY-PLACEHOLDER: Bench-only relay pulse bypasses signed-grant authorization; never use as lock firmware. See TODO_SECURITY_DEBT.md.
#define RELAY_GPIO GPIO_NUM_5
#define RELAY_ACTIVE_LEVEL 0
#define RELAY_INACTIVE_LEVEL 1
#define BLINK_COUNT 5
#define ACTIVE_MS 500
#define INACTIVE_MS 700

static const char *TAG = "RELAY_GPIO_TEST";

void app_main(void)
{
    const gpio_config_t gpio_cfg = {
        .pin_bit_mask = 1ULL << RELAY_GPIO,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };

    ESP_ERROR_CHECK(gpio_config(&gpio_cfg));
    ESP_ERROR_CHECK(gpio_set_level(RELAY_GPIO, RELAY_INACTIVE_LEVEL));

    ESP_LOGI(TAG, "BENCH TEST ONLY: GPIO%d relay input, active-low; %d pulses",
             RELAY_GPIO, BLINK_COUNT);
    ESP_LOGI(TAG, "No solenoid/load should be connected. Initial idle is HIGH.");
    vTaskDelay(pdMS_TO_TICKS(1000));

    for (int pulse = 1; pulse <= BLINK_COUNT; ++pulse) {
        ESP_LOGI(TAG, "Pulse %d/%d: GPIO%d LOW (relay ON)", pulse, BLINK_COUNT, RELAY_GPIO);
        ESP_ERROR_CHECK(gpio_set_level(RELAY_GPIO, RELAY_ACTIVE_LEVEL));
        vTaskDelay(pdMS_TO_TICKS(ACTIVE_MS));

        ESP_ERROR_CHECK(gpio_set_level(RELAY_GPIO, RELAY_INACTIVE_LEVEL));
        ESP_LOGI(TAG, "Pulse %d/%d: GPIO%d HIGH (relay OFF)", pulse, BLINK_COUNT, RELAY_GPIO);
        vTaskDelay(pdMS_TO_TICKS(INACTIVE_MS));
    }

    ESP_ERROR_CHECK(gpio_set_level(RELAY_GPIO, RELAY_INACTIVE_LEVEL));
    ESP_LOGI(TAG, "Test complete; GPIO%d left HIGH (inactive for common active-low modules).",
             RELAY_GPIO);
}
