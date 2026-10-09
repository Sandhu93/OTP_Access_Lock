#ifndef GRANT_VERIFIER_H
#define GRANT_VERIFIER_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "lock_logic.h"

typedef enum {
    GRANT_VERIFY_OK = 0,
    GRANT_VERIFY_BAD_PAYLOAD,
    GRANT_VERIFY_BAD_SIGNATURE,
    GRANT_VERIFY_WRONG_DEVICE,
    GRANT_VERIFY_EXPIRED,
    GRANT_VERIFY_REPLAY,
    GRANT_VERIFY_PRESENCE,
} grant_verify_result_t;

grant_verify_result_t grant_verifier_verify(const lock_logic_context_t *lock_context,
                                            const uint8_t *payload,
                                            size_t payload_len,
                                            int64_t now_epoch);
const char *grant_verify_result_name(grant_verify_result_t result);

#endif
