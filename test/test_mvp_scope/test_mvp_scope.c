#include "mvp_config.h"
#include "unity.h"

void setUp(void)
{
}

void tearDown(void)
{
}

static void test_backend_token_rule_remains_required(void)
{
    TEST_ASSERT_EQUAL_INT(1, MVP_BACKEND_TOKEN_REQUIRED);
}

static void test_rfid_nfc_is_disabled_for_current_mvp(void)
{
    TEST_ASSERT_EQUAL_INT(0, MVP_RFID_NFC_ENABLED);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_backend_token_rule_remains_required);
    RUN_TEST(test_rfid_nfc_is_disabled_for_current_mvp);
    return UNITY_END();
}
