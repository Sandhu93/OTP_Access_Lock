#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#include "esp_chip_info.h"
#include "esp_flash.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"

#include "ble_service.h"
#include "device_gateway.h"
#include "led_control.h"
#include "lock_logic.h"
#include "mvp_config.h"

static const char *TAG = "LOCK_MAIN";

#define LED_STATUS_GPIO GPIO_NUM_4
#define LED_ACTUATOR_GPIO GPIO_NUM_5
#define ACTUATOR_UNLOCK_HOLD_MS 10000

static lock_logic_context_t s_lock_context;
static TimerHandle_t s_actuator_off_timer;

static void configure_log_levels(void)
{
    esp_log_level_set("*", ESP_LOG_INFO);
    esp_log_level_set("LOCK_MAIN", ESP_LOG_VERBOSE);
    esp_log_level_set("LED_CONTROL", ESP_LOG_VERBOSE);
    esp_log_level_set("BLE_SERVICE", ESP_LOG_VERBOSE);
    esp_log_level_set("LOCK_LOGIC", ESP_LOG_VERBOSE);
}

static const char *chip_model_name(esp_chip_model_t model)
{
    switch (model) {
    case CHIP_ESP32S3:
        return "ESP32-S3";
    case CHIP_ESP32S2:
        return "ESP32-S2";
    case CHIP_ESP32:
        return "ESP32";
    case CHIP_ESP32C3:
        return "ESP32-C3";
    case CHIP_ESP32C2:
        return "ESP32-C2";
    case CHIP_ESP32C6:
        return "ESP32-C6";
    case CHIP_ESP32H2:
        return "ESP32-H2";
    default:
        return "Unknown ESP32";
    }
}

static void run_status_led_boot_test(void)
{
    ESP_LOGI(TAG, "Status LED boot test: GPIO4 three blinks; relay output is not tested");
    ESP_ERROR_CHECK_WITHOUT_ABORT(led_blink(LED_STATUS_GPIO, 3, 150));
}

static void actuator_off_timer_callback(TimerHandle_t timer)
{
    (void)timer;
    ESP_ERROR_CHECK_WITHOUT_ABORT(led_set(LED_ACTUATOR_GPIO, true));
    ESP_LOGI(TAG, "Unlock window complete: GPIO5 relay energized; lock relocked");
}

static esp_err_t init_actuator_timer(void)
{
    s_actuator_off_timer = xTimerCreate("actuator_off",
                                        pdMS_TO_TICKS(ACTUATOR_UNLOCK_HOLD_MS),
                                        pdFALSE,
                                        NULL,
                                        actuator_off_timer_callback);
    if (s_actuator_off_timer == NULL) {
        ESP_LOGE(TAG, "Failed to create actuator off timer");
        return ESP_ERR_NO_MEM;
    }

    return ESP_OK;
}

static void trigger_actuator_unlock(void)
{
    ESP_LOGI(TAG,
             "Verified development grant accepted; de-energizing active-low GPIO5 relay for %d ms to unlock",
             ACTUATOR_UNLOCK_HOLD_MS);

    ESP_ERROR_CHECK_WITHOUT_ABORT(led_set(LED_ACTUATOR_GPIO, false));

    if (s_actuator_off_timer == NULL) {
        ESP_LOGE(TAG, "Actuator off timer is not initialized; forcing relay energized/locked");
        ESP_ERROR_CHECK_WITHOUT_ABORT(led_set(LED_ACTUATOR_GPIO, true));
        return;
    }

    if (xTimerReset(s_actuator_off_timer, 0) != pdPASS) {
        ESP_LOGE(TAG, "Failed to arm actuator off timer; forcing relay energized/locked");
        ESP_ERROR_CHECK_WITHOUT_ABORT(led_set(LED_ACTUATOR_GPIO, true));
    }
}

static size_t on_ble_write(uint16_t conn_handle,
                           const uint8_t *data,
                           size_t len,
                           bool link_encrypted,
                           uint8_t *response,
                           size_t response_len,
                           bool *should_actuate)
{
    lock_logic_result_t result;
    if (!link_encrypted) {
        result = (lock_logic_result_t) {
            .state = s_lock_context.state,
            .response = LOCK_LOGIC_RESPONSE_ERR_UNENCRYPTED,
            .should_actuate = false,
        };
    } else {
        const uint32_t now_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
        result = lock_logic_handle_message_from_at(&s_lock_context,
                                                   conn_handle,
                                                   data,
                                                   len,
                                                   now_ms);
    }
    const size_t written = lock_logic_format_response(result.response, response, response_len);

    if (should_actuate != NULL) {
        *should_actuate = result.should_actuate;
    }

    ESP_LOGI(TAG, "BLE command handled: conn_handle=%u len=%zu encrypted=%d state=%s response=%s actuate=%d",
             conn_handle,
             len,
             link_encrypted,
             lock_logic_state_name(result.state),
             lock_logic_response_name(result.response),
             result.should_actuate);

    if (result.should_actuate) {
        ESP_LOGW(TAG, "BLE bench token path is ignored; only a verified MQTT signed grant may actuate");
    }

    return written;
}

static void on_ble_disconnect(uint16_t conn_handle)
{
    lock_logic_disconnect(&s_lock_context, conn_handle);
    ESP_LOGI(TAG, "BLE disconnect removed session: conn_handle=%u state=%s",
             conn_handle,
             lock_logic_state_name(s_lock_context.state));
}

void app_main(void)
{
    configure_log_levels();

    esp_chip_info_t chip_info;
    uint32_t flash_size = 0;

    esp_chip_info(&chip_info);
    ESP_ERROR_CHECK(esp_flash_get_size(NULL, &flash_size));

    ESP_LOGI(TAG, "AccessControlLock firmware startup");
    ESP_LOGI(TAG, "Chip: %s, revision %d, %d cores",
             chip_model_name(chip_info.model),
             chip_info.revision,
             chip_info.cores);
    ESP_LOGI(TAG, "Flash size: %" PRIu32 " MB", flash_size / (1024U * 1024U));
    ESP_LOGI(TAG, "Free heap: %zu bytes", heap_caps_get_free_size(MALLOC_CAP_DEFAULT));
    ESP_LOGI(TAG, "MVP scope: BLE-only local interaction, RFID/NFC disabled=%d",
             MVP_RFID_NFC_ENABLED == 0);
    ESP_LOGI(TAG, "Security: backend signed token required for production actuation=%d",
             MVP_BACKEND_TOKEN_REQUIRED);

    ESP_ERROR_CHECK(led_init());
    run_status_led_boot_test();
    ESP_ERROR_CHECK(init_actuator_timer());
    lock_logic_init(&s_lock_context);

    ESP_ERROR_CHECK(ble_service_start(on_ble_write, on_ble_disconnect));
    ESP_ERROR_CHECK(device_gateway_start(&s_lock_context, trigger_actuator_unlock));

    ESP_LOGI(TAG, "BLE + Wi-Fi/MQTT local-demo firmware running; RFID/NFC is not initialized");
    while (true) {
        ESP_LOGI(TAG, "Idle heartbeat: free heap=%zu bytes", heap_caps_get_free_size(MALLOC_CAP_DEFAULT));
        vTaskDelay(pdMS_TO_TICKS(30000));
    }
}
