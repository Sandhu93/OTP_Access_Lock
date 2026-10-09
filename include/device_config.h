#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

/*
 * The local preparation script writes demo_device_config.h with Wi-Fi credentials,
 * mTLS material, tenant/locker identifiers, and the public grant-verification key.
 * It is ignored by git. Empty fallbacks keep the firmware buildable, but the device
 * will remain offline until the local demo configuration is generated.
 */
#if defined(__has_include)
#if __has_include("demo_device_config.h")
#include "demo_device_config.h"
#endif
#endif

#ifndef DEMO_WIFI_SSID
#define DEMO_WIFI_SSID ""
#endif
#ifndef DEMO_WIFI_PASSWORD
#define DEMO_WIFI_PASSWORD ""
#endif
#ifndef DEMO_MQTT_URI
#define DEMO_MQTT_URI "mqtts://127.0.0.1:8883"
#endif
#ifndef DEMO_MQTT_CLIENT_ID
#define DEMO_MQTT_CLIENT_ID "lock-demo"
#endif
#ifndef DEMO_TENANT_ID
#define DEMO_TENANT_ID ""
#endif
#ifndef DEMO_LOCKER_ID
#define DEMO_LOCKER_ID ""
#endif
#ifndef DEMO_DEVICE_CERT_PEM
#define DEMO_DEVICE_CERT_PEM ""
#endif
#ifndef DEMO_DEVICE_KEY_PEM
#define DEMO_DEVICE_KEY_PEM ""
#endif
#ifndef DEMO_CA_CERT_PEM
#define DEMO_CA_CERT_PEM ""
#endif
#ifndef DEMO_SIGNING_PUBLIC_KEY_PEM
#define DEMO_SIGNING_PUBLIC_KEY_PEM ""
#endif
#ifndef DEMO_SIGNING_PUBLIC_KEY_LEN
#include <stdint.h>
static const uint8_t DEMO_SIGNING_PUBLIC_KEY[] = {0};
#define DEMO_SIGNING_PUBLIC_KEY_LEN 0U
#endif
#ifndef DEMO_SIGNING_KEY_ID
#define DEMO_SIGNING_KEY_ID "local-demo"
#endif

#endif
