#include "device_gateway.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "device_config.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "grant_verifier.h"
#include "mqtt_client.h"
#include "nvs_flash.h"

static const char *TAG = "DEVICE_GATEWAY";
#define WIFI_CONNECTED_BIT BIT0
#define TELEMETRY_INTERVAL_MS 30000
#define COMMAND_BUFFER_SIZE 4096

static EventGroupHandle_t s_wifi_events;
static esp_mqtt_client_handle_t s_mqtt_client;
static lock_logic_context_t *s_lock_context;
static device_gateway_actuate_cb_t s_actuate_callback;
static volatile bool s_mqtt_connected;
static char s_commands_topic[192];
static char s_telemetry_topic[192];
static char s_events_topic[192];
static uint8_t s_command_buffer[COMMAND_BUFFER_SIZE];
static size_t s_command_length;

static void publish_event(const char *event_type, const char *reason)
{
    if (!s_mqtt_connected) return;
    char payload[256];
    const int length = snprintf(payload, sizeof(payload),
                                "{\"event_type\":\"%s\",\"reason\":\"%s\"}",
                                event_type, reason != NULL ? reason : "");
    if (length > 0 && (size_t)length < sizeof(payload)) {
        esp_mqtt_client_publish(s_mqtt_client, s_events_topic, payload, length, 1, 0);
    }
}

static void publish_telemetry(void)
{
    if (!s_mqtt_connected || s_lock_context == NULL) return;
    char payload[320];
    const int length = snprintf(payload, sizeof(payload),
                                "{\"event_type\":\"heartbeat\",\"uptime_ms\":%lu,\"state\":\"%s\"}",
                                (unsigned long)(xTaskGetTickCount() * portTICK_PERIOD_MS),
                                lock_logic_state_name(s_lock_context->state));
    if (length > 0 && (size_t)length < sizeof(payload)) {
        esp_mqtt_client_publish(s_mqtt_client, s_telemetry_topic, payload, length, 1, 0);
    }
}

static void process_command(void)
{
    if (s_command_length == 0) return;
    const int64_t now_epoch = (int64_t)time(NULL);
    const grant_verify_result_t result = grant_verifier_verify(s_lock_context, s_command_buffer, s_command_length, now_epoch);
    if (result == GRANT_VERIFY_OK) {
        publish_event("unlock_grant_accepted", "signature_and_claims_valid");
        if (s_actuate_callback != NULL) s_actuate_callback();
    } else {
        publish_event("unlock_grant_rejected", grant_verify_result_name(result));
    }
    s_command_length = 0;
}

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)handler_args;
    (void)base;
    esp_mqtt_event_handle_t event = event_data;
    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
        s_mqtt_connected = true;
        esp_mqtt_client_subscribe(event->client, s_commands_topic, 1);
        publish_telemetry();
        ESP_LOGI(TAG, "MQTT connected and subscribed to lock command topic");
        break;
    case MQTT_EVENT_DISCONNECTED:
        s_mqtt_connected = false;
        ESP_LOGW(TAG, "MQTT disconnected; lock remains fail-closed");
        break;
    case MQTT_EVENT_DATA:
        if (event->topic_len != (int)strlen(s_commands_topic) ||
            memcmp(event->topic, s_commands_topic, event->topic_len) != 0 ||
            event->total_data_len > COMMAND_BUFFER_SIZE ||
            event->current_data_offset + event->data_len > COMMAND_BUFFER_SIZE) {
            s_command_length = 0;
            break;
        }
        if (event->current_data_offset == 0) s_command_length = 0;
        memcpy(&s_command_buffer[event->current_data_offset], event->data, event->data_len);
        s_command_length = event->current_data_offset + event->data_len;
        if (s_command_length == (size_t)event->total_data_len) process_command();
        break;
    default:
        break;
    }
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_data;
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(s_wifi_events, WIFI_CONNECTED_BIT);
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        xEventGroupSetBits(s_wifi_events, WIFI_CONNECTED_BIT);
    }
}

static esp_err_t start_wifi(void)
{
    if (strlen(DEMO_WIFI_SSID) == 0 || strlen(DEMO_WIFI_PASSWORD) == 0) {
        ESP_LOGE(TAG, "Wi-Fi credentials are missing; run prepare-esp32-demo.ps1");
        return ESP_ERR_INVALID_STATE;
    }
    s_wifi_events = xEventGroupCreate();
    if (s_wifi_events == NULL) return ESP_ERR_NO_MEM;
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init_config));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL));
    wifi_config_t wifi_config = {0};
    strlcpy((char *)wifi_config.sta.ssid, DEMO_WIFI_SSID, sizeof(wifi_config.sta.ssid));
    strlcpy((char *)wifi_config.sta.password, DEMO_WIFI_PASSWORD, sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    return ESP_OK;
}

static void gateway_task(void *arg)
{
    (void)arg;
    xEventGroupWaitBits(s_wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_init();

    esp_mqtt_client_config_t mqtt_config = {
        .broker.address.uri = DEMO_MQTT_URI,
        .broker.verification.certificate = DEMO_CA_CERT_PEM,
        .credentials.client_id = DEMO_MQTT_CLIENT_ID,
        .credentials.authentication.certificate = DEMO_DEVICE_CERT_PEM,
        .credentials.authentication.key = DEMO_DEVICE_KEY_PEM,
    };
    s_mqtt_client = esp_mqtt_client_init(&mqtt_config);
    if (s_mqtt_client == NULL) {
        ESP_LOGE(TAG, "MQTT client initialization failed");
        vTaskDelete(NULL);
        return;
    }
    ESP_ERROR_CHECK(esp_mqtt_client_register_event(s_mqtt_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL));
    ESP_ERROR_CHECK(esp_mqtt_client_start(s_mqtt_client));
    while (true) {
        publish_telemetry();
        vTaskDelay(pdMS_TO_TICKS(TELEMETRY_INTERVAL_MS));
    }
}

esp_err_t device_gateway_start(lock_logic_context_t *lock_context,
                               device_gateway_actuate_cb_t actuate_callback)
{
    if (lock_context == NULL || actuate_callback == NULL) return ESP_ERR_INVALID_ARG;
    s_lock_context = lock_context;
    s_actuate_callback = actuate_callback;
    snprintf(s_commands_topic, sizeof(s_commands_topic), "locks/%s/%s/commands", DEMO_TENANT_ID, DEMO_LOCKER_ID);
    snprintf(s_telemetry_topic, sizeof(s_telemetry_topic), "locks/%s/%s/telemetry", DEMO_TENANT_ID, DEMO_LOCKER_ID);
    snprintf(s_events_topic, sizeof(s_events_topic), "locks/%s/%s/events", DEMO_TENANT_ID, DEMO_LOCKER_ID);
    esp_err_t nvs_result = nvs_flash_init();
    if (nvs_result == ESP_ERR_NVS_NO_FREE_PAGES || nvs_result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        nvs_result = nvs_flash_init();
    }
    ESP_ERROR_CHECK(nvs_result);
    ESP_ERROR_CHECK(start_wifi());
    BaseType_t task_result = xTaskCreate(gateway_task, "device_gateway", 8192, NULL, 5, NULL);
    return task_result == pdPASS ? ESP_OK : ESP_ERR_NO_MEM;
}
