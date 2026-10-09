#include <Arduino.h>

namespace {

constexpr uint32_t kSerialBaud = 115200;
constexpr uint32_t kBlinkIntervalMs = 500;

uint32_t last_blink_ms = 0;
bool led_on = false;

void print_startup_banner()
{
    Serial.println();
    Serial.println("Teensy PlatformIO smoke test");
    Serial.println("Board target: Teensy 4.x");
    Serial.println("Built with Arduino framework");
    Serial.println("Built-in LED should blink every 500 ms");
}

}  // namespace

void setup()
{
    pinMode(LED_BUILTIN, OUTPUT);
    digitalWrite(LED_BUILTIN, LOW);

    Serial.begin(kSerialBaud);
    delay(1000);
    print_startup_banner();
}

void loop()
{
    const uint32_t now_ms = millis();
    if (now_ms - last_blink_ms >= kBlinkIntervalMs) {
        last_blink_ms = now_ms;
        led_on = !led_on;
        digitalWrite(LED_BUILTIN, led_on ? HIGH : LOW);
        Serial.println(led_on ? "LED ON" : "LED OFF");
    }
}
