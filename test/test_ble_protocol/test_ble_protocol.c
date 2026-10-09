#include <string.h>

#include "ble_protocol.h"
#include "unity.h"

void setUp(void)
{
}

void tearDown(void)
{
}

static void test_device_name_is_locked_for_phone_testing(void)
{
    TEST_ASSERT_EQUAL_STRING("LOCK-TEST-01", BLE_PROTOCOL_DEVICE_NAME);
}

static void test_event_names_are_stable(void)
{
    TEST_ASSERT_EQUAL_STRING("connect", ble_protocol_event_name(BLE_PROTOCOL_EVENT_CONNECT));
    TEST_ASSERT_EQUAL_STRING("disconnect", ble_protocol_event_name(BLE_PROTOCOL_EVENT_DISCONNECT));
    TEST_ASSERT_EQUAL_STRING("read", ble_protocol_event_name(BLE_PROTOCOL_EVENT_READ));
    TEST_ASSERT_EQUAL_STRING("write", ble_protocol_event_name(BLE_PROTOCOL_EVENT_WRITE));
    TEST_ASSERT_EQUAL_STRING("subscribe", ble_protocol_event_name(BLE_PROTOCOL_EVENT_SUBSCRIBE));
    TEST_ASSERT_EQUAL_STRING("notify_tx", ble_protocol_event_name(BLE_PROTOCOL_EVENT_NOTIFY_TX));
    TEST_ASSERT_EQUAL_STRING("unknown", ble_protocol_event_name(BLE_PROTOCOL_EVENT_UNKNOWN));
    TEST_ASSERT_EQUAL_STRING("unknown", ble_protocol_event_name((ble_protocol_event_t)99));
}

static void test_payload_validation_accepts_bounded_non_empty_payload(void)
{
    const uint8_t payload[] = {0x01, 0x02, 0x03};

    TEST_ASSERT_EQUAL_INT(BLE_PROTOCOL_PAYLOAD_OK,
                          ble_protocol_validate_payload(payload, sizeof(payload)));
}

static void test_payload_validation_rejects_empty_null_and_oversize(void)
{
    uint8_t payload[BLE_PROTOCOL_MAX_PAYLOAD_LEN + 1] = {0};

    TEST_ASSERT_EQUAL_INT(BLE_PROTOCOL_PAYLOAD_EMPTY,
                          ble_protocol_validate_payload(payload, 0));
    TEST_ASSERT_EQUAL_INT(BLE_PROTOCOL_PAYLOAD_EMPTY,
                          ble_protocol_validate_payload(NULL, 0));
    TEST_ASSERT_EQUAL_INT(BLE_PROTOCOL_PAYLOAD_INVALID_ARG,
                          ble_protocol_validate_payload(NULL, 1));
    TEST_ASSERT_EQUAL_INT(BLE_PROTOCOL_PAYLOAD_TOO_LARGE,
                          ble_protocol_validate_payload(payload, sizeof(payload)));
}

static void test_prepare_echo_copies_payload_exactly(void)
{
    const uint8_t input[] = {0xDE, 0xAD, 0xBE, 0xEF};
    uint8_t output[sizeof(input)] = {0};

    TEST_ASSERT_EQUAL_UINT(sizeof(input),
                           ble_protocol_prepare_echo(input, sizeof(input), output, sizeof(output)));
    TEST_ASSERT_EQUAL_UINT8_ARRAY(input, output, sizeof(input));
}

static void test_prepare_echo_truncates_to_output_buffer(void)
{
    const uint8_t input[] = {0x01, 0x02, 0x03, 0x04};
    uint8_t output[2] = {0};

    TEST_ASSERT_EQUAL_UINT(sizeof(output),
                           ble_protocol_prepare_echo(input, sizeof(input), output, sizeof(output)));
    TEST_ASSERT_EQUAL_HEX8(0x01, output[0]);
    TEST_ASSERT_EQUAL_HEX8(0x02, output[1]);
}

static void test_prepare_echo_handles_invalid_args(void)
{
    const uint8_t input[] = {0x01};
    uint8_t output[1] = {0};

    TEST_ASSERT_EQUAL_UINT(0, ble_protocol_prepare_echo(NULL, 1, output, sizeof(output)));
    TEST_ASSERT_EQUAL_UINT(0, ble_protocol_prepare_echo(input, sizeof(input), NULL, 1));
    TEST_ASSERT_EQUAL_UINT(0, ble_protocol_prepare_echo(input, sizeof(input), output, 0));
}

static void test_format_hex_formats_uppercase_bytes(void)
{
    const uint8_t input[] = {0x00, 0x0A, 0xF0, 0xFF};
    char output[16] = {0};

    TEST_ASSERT_EQUAL_UINT(11, ble_protocol_format_hex(input, sizeof(input), output, sizeof(output)));
    TEST_ASSERT_EQUAL_STRING("00 0A F0 FF", output);
}

static void test_format_hex_truncates_and_terminates(void)
{
    const uint8_t input[] = {0xDE, 0xAD, 0xBE};
    char output[5] = {0};

    TEST_ASSERT_EQUAL_UINT(sizeof(output) - 1,
                           ble_protocol_format_hex(input, sizeof(input), output, sizeof(output)));
    TEST_ASSERT_EQUAL_STRING("DE A", output);
    TEST_ASSERT_EQUAL_CHAR('\0', output[sizeof(output) - 1]);
}

static void test_format_hex_handles_empty_and_null(void)
{
    const uint8_t input[] = {0x01};
    char output[4] = {'x', 'x', 'x', '\0'};

    TEST_ASSERT_EQUAL_UINT(0, ble_protocol_format_hex(input, 0, output, sizeof(output)));
    TEST_ASSERT_EQUAL_STRING("", output);
    TEST_ASSERT_EQUAL_UINT(0, ble_protocol_format_hex(NULL, 1, output, sizeof(output)));
    TEST_ASSERT_EQUAL_STRING("", output);
    TEST_ASSERT_EQUAL_UINT(0, ble_protocol_format_hex(input, sizeof(input), NULL, 4));
    TEST_ASSERT_EQUAL_UINT(0, ble_protocol_format_hex(input, sizeof(input), output, 0));
}

static void test_notification_enabled_when_notify_or_indicate_is_enabled(void)
{
    TEST_ASSERT_FALSE(ble_protocol_notifications_enabled(false, false));
    TEST_ASSERT_TRUE(ble_protocol_notifications_enabled(true, false));
    TEST_ASSERT_TRUE(ble_protocol_notifications_enabled(false, true));
    TEST_ASSERT_TRUE(ble_protocol_notifications_enabled(true, true));
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_device_name_is_locked_for_phone_testing);
    RUN_TEST(test_event_names_are_stable);
    RUN_TEST(test_payload_validation_accepts_bounded_non_empty_payload);
    RUN_TEST(test_payload_validation_rejects_empty_null_and_oversize);
    RUN_TEST(test_prepare_echo_copies_payload_exactly);
    RUN_TEST(test_prepare_echo_truncates_to_output_buffer);
    RUN_TEST(test_prepare_echo_handles_invalid_args);
    RUN_TEST(test_format_hex_formats_uppercase_bytes);
    RUN_TEST(test_format_hex_truncates_and_terminates);
    RUN_TEST(test_format_hex_handles_empty_and_null);
    RUN_TEST(test_notification_enabled_when_notify_or_indicate_is_enabled);
    return UNITY_END();
}
