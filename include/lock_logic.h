#ifndef LOCK_LOGIC_H
#define LOCK_LOGIC_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define LOCK_LOGIC_PROTOCOL_VERSION 0x01
#define LOCK_LOGIC_REQUEST_TIMEOUT_MS 60000U
#define LOCK_LOGIC_MAX_FRAME_LEN 64U
#define LOCK_LOGIC_MAX_TOKEN_LEN 32U
#define LOCK_LOGIC_RESPONSE_HEADER_LEN 2U
#define LOCK_LOGIC_MAX_SESSIONS 3U
#define LOCK_LOGIC_SESSION_ID_LEN 8U
#define LOCK_LOGIC_INVALID_CONN_HANDLE 0xFFFFU

#define LOCK_LOGIC_CMD_REQUEST_UNLOCK 0x01
#define LOCK_LOGIC_CMD_SUBMIT_TOKEN 0x02
#define LOCK_LOGIC_CMD_CANCEL 0x03
#define LOCK_LOGIC_CMD_OPEN_SESSION 0x10
#define LOCK_LOGIC_CMD_SESSION_HEARTBEAT 0x11
#define LOCK_LOGIC_CMD_CLOSE_SESSION 0x12

#define LOCK_LOGIC_ROLE_REQUESTER 0x01
#define LOCK_LOGIC_ROLE_APPROVER 0x02

typedef enum {
    LOCK_LOGIC_STATE_IDLE = 0,
    LOCK_LOGIC_STATE_REQUEST_PENDING,
    LOCK_LOGIC_STATE_TOKEN_ACCEPTED,
    LOCK_LOGIC_STATE_UNLOCKED_TEMPORARILY,
} lock_logic_state_t;

typedef enum {
    LOCK_LOGIC_RESPONSE_LOCK_IDLE = 0,
    LOCK_LOGIC_RESPONSE_LOCK_WAITING_TOKEN,
    LOCK_LOGIC_RESPONSE_UNLOCK_OK,
    LOCK_LOGIC_RESPONSE_UNLOCK_DENIED,
    LOCK_LOGIC_RESPONSE_LOCK_CANCELLED,
    LOCK_LOGIC_RESPONSE_LOCK_RESET,
    LOCK_LOGIC_RESPONSE_ERR_EMPTY,
    LOCK_LOGIC_RESPONSE_ERR_UNKNOWN_COMMAND,
    LOCK_LOGIC_RESPONSE_ERR_BAD_PAYLOAD,
    LOCK_LOGIC_RESPONSE_ERR_TOKEN_REQUIRED,
    LOCK_LOGIC_RESPONSE_ERR_VERSION_UNSUPPORTED,
    LOCK_LOGIC_RESPONSE_ERR_TIMEOUT,
    LOCK_LOGIC_RESPONSE_ERR_UNENCRYPTED,
    LOCK_LOGIC_RESPONSE_SESSION_OPENED,
    LOCK_LOGIC_RESPONSE_SESSION_ACTIVE,
    LOCK_LOGIC_RESPONSE_SESSION_CLOSED,
    LOCK_LOGIC_RESPONSE_ERR_SESSION_REQUIRED,
    LOCK_LOGIC_RESPONSE_ERR_SESSION_ROLE,
    LOCK_LOGIC_RESPONSE_ERR_SESSION_CONFLICT,
} lock_logic_response_t;

typedef struct {
    bool active;
    uint16_t conn_handle;
    uint8_t role;
    uint8_t session_id[LOCK_LOGIC_SESSION_ID_LEN];
    uint32_t last_seen_ms;
} lock_logic_session_t;

typedef struct {
    lock_logic_state_t state;
    uint32_t request_started_ms;
    uint16_t requester_conn_handle;
    uint16_t approver_conn_handle;
    lock_logic_session_t sessions[LOCK_LOGIC_MAX_SESSIONS];
} lock_logic_context_t;

typedef struct {
    lock_logic_state_t state;
    lock_logic_response_t response;
    bool should_actuate;
} lock_logic_result_t;

void lock_logic_init(lock_logic_context_t *ctx);
void lock_logic_reset(lock_logic_context_t *ctx);
// Legacy single-client bench helpers. Production transport must use the
// connection-aware functions below so commands are bound to a BLE session.
lock_logic_result_t lock_logic_handle_message(lock_logic_context_t *ctx,
                                              const uint8_t *data,
                                              size_t len);
lock_logic_result_t lock_logic_handle_message_at(lock_logic_context_t *ctx,
                                                  const uint8_t *data,
                                                  size_t len,
                                                  uint32_t now_ms);
lock_logic_result_t lock_logic_handle_message_from(lock_logic_context_t *ctx,
                                                    uint16_t conn_handle,
                                                    const uint8_t *data,
                                                    size_t len);
lock_logic_result_t lock_logic_handle_message_from_at(lock_logic_context_t *ctx,
                                                      uint16_t conn_handle,
                                                      const uint8_t *data,
                                                      size_t len,
                                                      uint32_t now_ms);
void lock_logic_disconnect(lock_logic_context_t *ctx, uint16_t conn_handle);
bool lock_logic_has_session_identifier(const lock_logic_context_t *ctx, const char *identifier);
const char *lock_logic_state_name(lock_logic_state_t state);
const char *lock_logic_response_name(lock_logic_response_t response);
uint8_t lock_logic_response_code(lock_logic_response_t response);
size_t lock_logic_format_response(lock_logic_response_t response, uint8_t *out, size_t out_len);

#endif
