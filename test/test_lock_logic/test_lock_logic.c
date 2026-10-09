#include <string.h>

#include "lock_logic.h"
#include "unity.h"

#define T0_MS 1000U
#define REQUESTER_CONN 11U
#define APPROVER_CONN 22U

void setUp(void)
{
}

void tearDown(void)
{
}

static void assert_response_frame(lock_logic_response_t response,
                                  uint8_t expected_code,
                                  const char *expected_text)
{
    uint8_t buffer[48] = {0};
    const size_t written = lock_logic_format_response(response, buffer, sizeof(buffer));

    TEST_ASSERT_EQUAL_UINT8(LOCK_LOGIC_PROTOCOL_VERSION, buffer[0]);
    TEST_ASSERT_EQUAL_UINT8(expected_code, buffer[1]);
    TEST_ASSERT_EQUAL_STRING(expected_text, (const char *)&buffer[LOCK_LOGIC_RESPONSE_HEADER_LEN]);
    TEST_ASSERT_EQUAL_UINT(LOCK_LOGIC_RESPONSE_HEADER_LEN + strlen(expected_text), written);
}

static void test_init_starts_idle(void)
{
    lock_logic_context_t ctx = {
        .state = LOCK_LOGIC_STATE_UNLOCKED_TEMPORARILY,
        .request_started_ms = 42,
    };

    lock_logic_init(&ctx);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
    TEST_ASSERT_EQUAL_UINT32(0, ctx.request_started_ms);
    TEST_ASSERT_EQUAL_STRING("IDLE", lock_logic_state_name(ctx.state));
}

static void test_empty_payload_is_rejected_without_state_change(void)
{
    lock_logic_context_t ctx;
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, NULL, 0, T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, result.state);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_EMPTY, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
}

static void test_short_frame_is_bad_payload(void)
{
    lock_logic_context_t ctx;
    uint8_t payload[] = {LOCK_LOGIC_PROTOCOL_VERSION};
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, payload, sizeof(payload), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
}

static void test_unsupported_protocol_version_is_rejected(void)
{
    lock_logic_context_t ctx;
    uint8_t payload[] = {0x02, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, payload, sizeof(payload), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_VERSION_UNSUPPORTED, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
}

static void test_unknown_command_is_rejected(void)
{
    lock_logic_context_t ctx;
    uint8_t payload[] = {LOCK_LOGIC_PROTOCOL_VERSION, 0x7F};
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, payload, sizeof(payload), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_UNKNOWN_COMMAND, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
}

static void test_oversized_frame_is_bad_payload(void)
{
    lock_logic_context_t ctx;
    uint8_t payload[LOCK_LOGIC_MAX_FRAME_LEN + 1] = {0};
    payload[0] = LOCK_LOGIC_PROTOCOL_VERSION;
    payload[1] = LOCK_LOGIC_CMD_CANCEL;
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, payload, sizeof(payload), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
}

static void test_request_unlock_moves_to_waiting_for_token(void)
{
    lock_logic_context_t ctx;
    uint8_t payload[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, payload, sizeof(payload), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_REQUEST_PENDING, result.state);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_REQUEST_PENDING, ctx.state);
    TEST_ASSERT_EQUAL_UINT32(T0_MS, ctx.request_started_ms);
}

static void test_request_unlock_rejects_extra_payload(void)
{
    lock_logic_context_t ctx;
    uint8_t payload[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK, 0x00};
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, payload, sizeof(payload), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
}

static void test_token_cannot_unlock_from_idle(void)
{
    lock_logic_context_t ctx;
    uint8_t payload[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN,
                         '1', '2', '3', '4', '5', '6'};
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, payload, sizeof(payload), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_TOKEN_REQUIRED, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
}

static void test_empty_token_is_bad_payload(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    uint8_t submit[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN};
    lock_logic_init(&ctx);
    (void)lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, submit, sizeof(submit), T0_MS + 1);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_REQUEST_PENDING, ctx.state);
}

static void test_oversized_token_is_bad_payload(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    uint8_t submit[LOCK_LOGIC_MAX_TOKEN_LEN + LOCK_LOGIC_RESPONSE_HEADER_LEN + 1] = {
        LOCK_LOGIC_PROTOCOL_VERSION,
        LOCK_LOGIC_CMD_SUBMIT_TOKEN,
    };
    lock_logic_init(&ctx);
    memset(&submit[2], '1', sizeof(submit) - 2);
    (void)lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, submit, sizeof(submit), T0_MS + 1);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_REQUEST_PENDING, ctx.state);
}

static void test_wrong_token_denies_and_resets_to_idle(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    uint8_t submit[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN,
                        '0', '0', '0', '0', '0', '0'};
    lock_logic_init(&ctx);
    (void)lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, submit, sizeof(submit), T0_MS + 1);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, result.state);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_UNLOCK_DENIED, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
    TEST_ASSERT_EQUAL_UINT32(0, ctx.request_started_ms);
}

static void test_valid_token_unlocks_only_after_request(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    uint8_t submit[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN,
                        '1', '2', '3', '4', '5', '6'};
    lock_logic_init(&ctx);

    const lock_logic_result_t waiting = lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);
    const lock_logic_result_t unlocked = lock_logic_handle_message_at(&ctx, submit, sizeof(submit), T0_MS + 1);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN, waiting.response);
    TEST_ASSERT_FALSE(waiting.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_UNLOCKED_TEMPORARILY, unlocked.state);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_UNLOCK_OK, unlocked.response);
    TEST_ASSERT_TRUE(unlocked.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_UNLOCKED_TEMPORARILY, ctx.state);
    TEST_ASSERT_EQUAL_UINT32(0, ctx.request_started_ms);
}

static void test_request_timeout_resets_and_fails_closed(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    uint8_t submit[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN,
                        '1', '2', '3', '4', '5', '6'};
    lock_logic_init(&ctx);
    (void)lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);

    const lock_logic_result_t result =
        lock_logic_handle_message_at(&ctx, submit, sizeof(submit),
                                     T0_MS + LOCK_LOGIC_REQUEST_TIMEOUT_MS + 1);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, result.state);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_TIMEOUT, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
}

static void test_request_at_timeout_boundary_is_still_accepted(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    uint8_t submit[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN,
                        '1', '2', '3', '4', '5', '6'};
    lock_logic_init(&ctx);
    (void)lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);

    const lock_logic_result_t result =
        lock_logic_handle_message_at(&ctx, submit, sizeof(submit),
                                     T0_MS + LOCK_LOGIC_REQUEST_TIMEOUT_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_UNLOCK_OK, result.response);
    TEST_ASSERT_TRUE(result.should_actuate);
}

static void test_cancel_resets_pending_request(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    uint8_t cancel[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_CANCEL};
    uint8_t submit[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN,
                        '1', '2', '3', '4', '5', '6'};
    lock_logic_init(&ctx);
    (void)lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);

    const lock_logic_result_t cancelled = lock_logic_handle_message_at(&ctx, cancel, sizeof(cancel), T0_MS + 1);
    const lock_logic_result_t after_cancel = lock_logic_handle_message_at(&ctx, submit, sizeof(submit), T0_MS + 2);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_LOCK_CANCELLED, cancelled.response);
    TEST_ASSERT_FALSE(cancelled.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_TOKEN_REQUIRED, after_cancel.response);
    TEST_ASSERT_FALSE(after_cancel.should_actuate);
}

static void test_cancel_rejects_extra_payload(void)
{
    lock_logic_context_t ctx;
    uint8_t cancel[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_CANCEL, 0x00};
    lock_logic_init(&ctx);

    const lock_logic_result_t result = lock_logic_handle_message_at(&ctx, cancel, sizeof(cancel), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
}

static void test_reset_clears_pending_request(void)
{
    lock_logic_context_t ctx;
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    lock_logic_init(&ctx);
    (void)lock_logic_handle_message_at(&ctx, request, sizeof(request), T0_MS);

    lock_logic_reset(&ctx);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
    TEST_ASSERT_EQUAL_UINT32(0, ctx.request_started_ms);
}

static void test_null_context_is_rejected(void)
{
    uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};

    const lock_logic_result_t result = lock_logic_handle_message_at(NULL, request, sizeof(request), T0_MS);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, result.state);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, result.response);
    TEST_ASSERT_FALSE(result.should_actuate);
}

static void test_response_frames_are_stable_for_phone_testing(void)
{
    assert_response_frame(LOCK_LOGIC_RESPONSE_LOCK_IDLE, 0x10, "LOCK_IDLE");
    assert_response_frame(LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN, 0x11, "LOCK_WAITING_TOKEN");
    assert_response_frame(LOCK_LOGIC_RESPONSE_UNLOCK_OK, 0x12, "UNLOCK_OK");
    assert_response_frame(LOCK_LOGIC_RESPONSE_UNLOCK_DENIED, 0x13, "UNLOCK_DENIED");
    assert_response_frame(LOCK_LOGIC_RESPONSE_LOCK_CANCELLED, 0x14, "LOCK_CANCELLED");
    assert_response_frame(LOCK_LOGIC_RESPONSE_LOCK_RESET, 0x15, "LOCK_RESET");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_EMPTY, 0x80, "ERR_EMPTY");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_UNKNOWN_COMMAND, 0x81, "ERR_UNKNOWN_COMMAND");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD, 0x82, "ERR_BAD_PAYLOAD");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_TOKEN_REQUIRED, 0x83, "ERR_TOKEN_REQUIRED");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_VERSION_UNSUPPORTED, 0x84, "ERR_VERSION_UNSUPPORTED");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_TIMEOUT, 0x85, "ERR_TIMEOUT");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_UNENCRYPTED, 0x86, "ERR_UNENCRYPTED");
}

static void test_response_format_truncates_text_but_keeps_header(void)
{
    uint8_t buffer[6] = {0};

    const size_t written = lock_logic_format_response(LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN,
                                                      buffer,
                                                      sizeof(buffer));

    TEST_ASSERT_EQUAL_UINT(6, written);
    TEST_ASSERT_EQUAL_UINT8(LOCK_LOGIC_PROTOCOL_VERSION, buffer[0]);
    TEST_ASSERT_EQUAL_UINT8(0x11, buffer[1]);
    TEST_ASSERT_EQUAL_MEMORY("LOCK", &buffer[2], 4);
}

static void test_response_format_handles_tiny_buffers(void)
{
    uint8_t one_byte[1] = {0};
    uint8_t two_bytes[2] = {0};

    TEST_ASSERT_EQUAL_UINT(1, lock_logic_format_response(LOCK_LOGIC_RESPONSE_UNLOCK_OK,
                                                         one_byte,
                                                         sizeof(one_byte)));
    TEST_ASSERT_EQUAL_UINT8(LOCK_LOGIC_PROTOCOL_VERSION, one_byte[0]);

    TEST_ASSERT_EQUAL_UINT(2, lock_logic_format_response(LOCK_LOGIC_RESPONSE_UNLOCK_OK,
                                                         two_bytes,
                                                         sizeof(two_bytes)));
    TEST_ASSERT_EQUAL_UINT8(LOCK_LOGIC_PROTOCOL_VERSION, two_bytes[0]);
    TEST_ASSERT_EQUAL_UINT8(0x12, two_bytes[1]);
}

static void test_session_response_frames_are_stable(void)
{
    assert_response_frame(LOCK_LOGIC_RESPONSE_SESSION_OPENED, 0x16, "SESSION_OPENED");
    assert_response_frame(LOCK_LOGIC_RESPONSE_SESSION_ACTIVE, 0x17, "SESSION_ACTIVE");
    assert_response_frame(LOCK_LOGIC_RESPONSE_SESSION_CLOSED, 0x18, "SESSION_CLOSED");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED, 0x87, "ERR_SESSION_REQUIRED");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_SESSION_ROLE, 0x88, "ERR_SESSION_ROLE");
    assert_response_frame(LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT, 0x89, "ERR_SESSION_CONFLICT");
}

static lock_logic_result_t open_session(lock_logic_context_t *ctx,
                                        uint16_t conn_handle,
                                        uint8_t role,
                                        uint32_t now_ms)
{
    const uint8_t frame[] = {
        LOCK_LOGIC_PROTOCOL_VERSION,
        LOCK_LOGIC_CMD_OPEN_SESSION,
        role,
        1, 2, 3, 4, 5, 6, 7, 8,
    };
    return lock_logic_handle_message_from_at(ctx, conn_handle, frame, sizeof(frame), now_ms);
}

static void test_session_open_requires_explicit_role_and_keeps_slots_separate(void)
{
    lock_logic_context_t ctx;
    lock_logic_init(&ctx);

    const lock_logic_result_t requester =
        open_session(&ctx, REQUESTER_CONN, LOCK_LOGIC_ROLE_REQUESTER, T0_MS);
    const lock_logic_result_t approver =
        open_session(&ctx, APPROVER_CONN, LOCK_LOGIC_ROLE_APPROVER, T0_MS + 1);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_SESSION_OPENED, requester.response);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_SESSION_OPENED, approver.response);
    TEST_ASSERT_TRUE(ctx.sessions[0].active);
    TEST_ASSERT_TRUE(ctx.sessions[1].active);
    TEST_ASSERT_EQUAL_UINT16(REQUESTER_CONN, ctx.sessions[0].conn_handle);
    TEST_ASSERT_EQUAL_UINT16(APPROVER_CONN, ctx.sessions[1].conn_handle);
}

static void test_duplicate_role_session_is_rejected(void)
{
    lock_logic_context_t ctx;
    lock_logic_init(&ctx);

    (void)open_session(&ctx, REQUESTER_CONN, LOCK_LOGIC_ROLE_REQUESTER, T0_MS);
    const lock_logic_result_t duplicate =
        open_session(&ctx, APPROVER_CONN, LOCK_LOGIC_ROLE_REQUESTER, T0_MS + 1);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT, duplicate.response);
}

static void test_role_scopes_request_and_token_commands(void)
{
    lock_logic_context_t ctx;
    const uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    const uint8_t token[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SUBMIT_TOKEN,
                             '1', '2', '3', '4', '5', '6'};
    lock_logic_init(&ctx);
    (void)open_session(&ctx, REQUESTER_CONN, LOCK_LOGIC_ROLE_REQUESTER, T0_MS);
    (void)open_session(&ctx, APPROVER_CONN, LOCK_LOGIC_ROLE_APPROVER, T0_MS + 1);

    const lock_logic_result_t bad_request =
        lock_logic_handle_message_from_at(&ctx, APPROVER_CONN, request, sizeof(request), T0_MS + 2);
    const lock_logic_result_t waiting =
        lock_logic_handle_message_from_at(&ctx, REQUESTER_CONN, request, sizeof(request), T0_MS + 3);
    const lock_logic_result_t unlocked =
        lock_logic_handle_message_from_at(&ctx, APPROVER_CONN, token, sizeof(token), T0_MS + 4);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_SESSION_ROLE, bad_request.response);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN, waiting.response);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_UNLOCK_OK, unlocked.response);
    TEST_ASSERT_TRUE(unlocked.should_actuate);
}

static void test_disconnect_aborts_pending_request_and_removes_only_that_session(void)
{
    lock_logic_context_t ctx;
    const uint8_t request[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_REQUEST_UNLOCK};
    lock_logic_init(&ctx);
    (void)open_session(&ctx, REQUESTER_CONN, LOCK_LOGIC_ROLE_REQUESTER, T0_MS);
    (void)open_session(&ctx, APPROVER_CONN, LOCK_LOGIC_ROLE_APPROVER, T0_MS + 1);
    (void)lock_logic_handle_message_from_at(&ctx, REQUESTER_CONN, request, sizeof(request), T0_MS + 2);

    lock_logic_disconnect(&ctx, APPROVER_CONN);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_STATE_IDLE, ctx.state);
    TEST_ASSERT_FALSE(ctx.sessions[1].active);
    TEST_ASSERT_TRUE(ctx.sessions[0].active);
}

static void test_session_heartbeat_requires_an_open_session(void)
{
    lock_logic_context_t ctx;
    const uint8_t heartbeat[] = {LOCK_LOGIC_PROTOCOL_VERSION, LOCK_LOGIC_CMD_SESSION_HEARTBEAT};
    lock_logic_init(&ctx);

    const lock_logic_result_t rejected =
        lock_logic_handle_message_from_at(&ctx, REQUESTER_CONN, heartbeat, sizeof(heartbeat), T0_MS);
    (void)open_session(&ctx, REQUESTER_CONN, LOCK_LOGIC_ROLE_REQUESTER, T0_MS + 1);
    const lock_logic_result_t accepted =
        lock_logic_handle_message_from_at(&ctx, REQUESTER_CONN, heartbeat, sizeof(heartbeat), T0_MS + 2);

    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED, rejected.response);
    TEST_ASSERT_EQUAL_INT(LOCK_LOGIC_RESPONSE_SESSION_ACTIVE, accepted.response);
    TEST_ASSERT_EQUAL_UINT32(T0_MS + 2, ctx.sessions[0].last_seen_ms);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_init_starts_idle);
    RUN_TEST(test_empty_payload_is_rejected_without_state_change);
    RUN_TEST(test_short_frame_is_bad_payload);
    RUN_TEST(test_unsupported_protocol_version_is_rejected);
    RUN_TEST(test_unknown_command_is_rejected);
    RUN_TEST(test_oversized_frame_is_bad_payload);
    RUN_TEST(test_request_unlock_moves_to_waiting_for_token);
    RUN_TEST(test_request_unlock_rejects_extra_payload);
    RUN_TEST(test_token_cannot_unlock_from_idle);
    RUN_TEST(test_empty_token_is_bad_payload);
    RUN_TEST(test_oversized_token_is_bad_payload);
    RUN_TEST(test_wrong_token_denies_and_resets_to_idle);
    RUN_TEST(test_valid_token_unlocks_only_after_request);
    RUN_TEST(test_request_timeout_resets_and_fails_closed);
    RUN_TEST(test_request_at_timeout_boundary_is_still_accepted);
    RUN_TEST(test_cancel_resets_pending_request);
    RUN_TEST(test_cancel_rejects_extra_payload);
    RUN_TEST(test_reset_clears_pending_request);
    RUN_TEST(test_null_context_is_rejected);
    RUN_TEST(test_response_frames_are_stable_for_phone_testing);
    RUN_TEST(test_response_format_truncates_text_but_keeps_header);
    RUN_TEST(test_response_format_handles_tiny_buffers);
    RUN_TEST(test_session_response_frames_are_stable);
    RUN_TEST(test_session_open_requires_explicit_role_and_keeps_slots_separate);
    RUN_TEST(test_duplicate_role_session_is_rejected);
    RUN_TEST(test_role_scopes_request_and_token_commands);
    RUN_TEST(test_disconnect_aborts_pending_request_and_removes_only_that_session);
    RUN_TEST(test_session_heartbeat_requires_an_open_session);
    return UNITY_END();
}
