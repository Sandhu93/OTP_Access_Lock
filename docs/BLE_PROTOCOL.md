# BLE Protocol

This document is the single source of truth for the GATT protocol between the mobile app and the
lock firmware. Firmware and app code must match this file exactly - update this doc in the same
change as any protocol change, in either codebase.

## Status: PRE-FREEZE / PLACEHOLDER

All UUIDs and command byte values below are temporary, assigned during the hardware MVP phase for
bench testing only. They must be finalized before any integration with a real backend or real app
build. See `TODO_SECURITY_DEBT.md`.

The MVP has moved to BLE-only local interaction. RFID/NFC commands or tap events are not part of
the current protocol. BLE is a transport and local presence signal only; it is not the actuation
trust anchor. Unlock actuation still requires a backend-issued signed token once backend
integration exists.

The lock is a BLE peripheral and the mobile apps are BLE centrals. The current ESP32 configuration
supports up to three simultaneous BLE connections so a requester and approvers can maintain
independent sessions. The lock must never infer role from connection order. Each connection is
identified by its connection handle at the transport layer and by an explicit transaction-bound
session at the application layer.

The apps do not communicate directly with one another over BLE. Each app communicates with the lock
through its own connection and with the backend over an authenticated network channel. The backend
remains the source of truth for admin approval, OTP verification, simultaneous-presence checks,
and signed unlock-token issuance.

## Device identity

- Advertised name (MVP/bench): `LOCK-TEST-01`
- Production naming scheme: TBD - likely needs to encode lock/site identity without leaking
  sensitive info in a public BLE advertisement. Decide before Rev 1 hardware.

## GATT service (placeholder)

| Item | Value | Status |
|---|---|---|
| Service UUID | `7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0001` | placeholder, bench test only |
| Command/status characteristic UUID | `7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0002` | read/write/notify, placeholder, bench test only |

## Frame format

All command writes use:

| Offset | Field | Value |
|---|---|---|
| 0 | Protocol version | `0x01` |
| 1 | Command byte | See command table |
| 2..N | Payload | Command-specific |

All status notifications/read values use:

| Offset | Field | Value |
|---|---|---|
| 0 | Protocol version | `0x01` |
| 1 | Status code | See response table |
| 2..N | Text status | ASCII, for bench testing and nRF Connect readability |

Maximum accepted write frame length is 64 bytes. Maximum simulated token payload length is 32
bytes. Empty writes, one-byte frames, unsupported protocol versions, oversized frames, unknown
commands, and malformed command payloads fail closed and do not actuate.

Command writes are rejected until the BLE link reports encrypted. The current MVP uses NimBLE
security initiation / Just Works encryption as scaffolding only; this is not production-grade
mutual authentication.

## Command byte protocol (placeholder, versioned commands used in MVP)

| Byte value | Meaning | Direction | Status |
|---|---|---|---|
| `0x01` | `REQUEST_UNLOCK` | app -> lock | starts placeholder unlock request, no actuation |
| `0x02` + ASCII token bytes | `SUBMIT_TOKEN` | app -> lock | submits placeholder backend token |
| `0x03` | `CANCEL` | app -> lock | cancels current placeholder request and returns to idle |
| `0x10` + session payload | `OPEN_SESSION` | app -> lock | opens a role-bound bench session |
| `0x11` | `SESSION_HEARTBEAT` | app -> lock | refreshes the active session liveness timestamp |
| `0x12` | `CLOSE_SESSION` | app -> lock | closes the calling session |

### Session payload (bench placeholder)

`OPEN_SESSION` uses the following payload after the command byte:

| Offset | Field | Value |
|---|---|---|
| 0 | Role | `0x01` requester, `0x02` approver |
| 1..8 | Session ID | opaque, non-zero 8-byte value |

The current bench firmware accepts the role and session ID after the BLE link is encrypted. This
is not an authenticated identity or authorization grant. Production must replace it with a
backend-issued, short-lived, transaction-bound grant tied to the phone's hardware-backed identity.
The lock must continue to reject actuation unless a backend-issued signed token is verified.

The current MVP allows one requester and one approver session. The transport table supports up to
three simultaneous connections so a third enrolled approver can be added later without changing
the connection model.

## Status responses (ASCII notification/read value)

| Code | Text | Meaning |
|---|---|---|
| `0x10` | `LOCK_IDLE` | Lock state is idle |
| `0x11` | `LOCK_WAITING_TOKEN` | `REQUEST_UNLOCK` was accepted; firmware is waiting for token submission |
| `0x12` | `UNLOCK_OK` | Placeholder token accepted; actuator LED is held ON for 10 seconds |
| `0x13` | `UNLOCK_DENIED` | Placeholder token was wrong; request resets to idle |
| `0x14` | `LOCK_CANCELLED` | Request was cancelled and state reset to idle |
| `0x15` | `LOCK_RESET` | State reset occurred |
| `0x80` | `ERR_EMPTY` | Empty write rejected |
| `0x81` | `ERR_UNKNOWN_COMMAND` | Unknown command byte rejected |
| `0x82` | `ERR_BAD_PAYLOAD` | Command had invalid payload length/content |
| `0x83` | `ERR_TOKEN_REQUIRED` | Token was submitted before a pending request existed |
| `0x84` | `ERR_VERSION_UNSUPPORTED` | Protocol version byte was not `0x01` |
| `0x85` | `ERR_TIMEOUT` | Pending request expired before the next command |
| `0x86` | `ERR_UNENCRYPTED` | Command was rejected because BLE link was not encrypted |
| `0x16` | `SESSION_OPENED` | Calling connection opened its role-bound bench session |
| `0x17` | `SESSION_ACTIVE` | Calling connection heartbeat was accepted |
| `0x18` | `SESSION_CLOSED` | Calling connection closed its session |
| `0x87` | `ERR_SESSION_REQUIRED` | Command requires an open session |
| `0x88` | `ERR_SESSION_ROLE` | Calling session is not allowed to issue this command |
| `0x89` | `ERR_SESSION_CONFLICT` | Role/session slot is already occupied or inconsistent |

`REQUEST_PENDING` expires after 60 seconds. Expiry resets the state to idle and returns
`ERR_TIMEOUT`; it never actuates. Disconnecting the requester or approver removes only that
connection's session, but aborts a pending request fail-closed.

Notifications and read-back responses are scoped to the connection that issued the command. A
second connected phone must never receive the first phone's response buffer by accident.

## Two-phone bench sequence

1. Phone A connects and waits for BLE encryption.
2. Phone A enables notifications and writes `01 10 01 <8-byte-session-id>`.
3. Phone B connects while Phone A remains connected, waits for BLE encryption, enables
   notifications, and writes `01 10 02 <8-byte-session-id>`.
4. Phone A writes `01 01` and expects `LOCK_WAITING_TOKEN` only on Phone A's notification stream.
5. Phone B writes the simulated token frame and expects its own response notification.
6. Confirm that disconnecting either phone removes only its session and that a pending request does
   not actuate.

This sequence validates transport/session plumbing only. It does not make the bench role payload
secure or production-ready.

## Legacy single-phone nRF Connect bench sequence

1. Enable notifications on the command/status characteristic.
2. Pair/bond if nRF Connect prompts for it, then wait for the serial log to show encryption.
3. Write bytes `01 01`.
4. Expect notification bytes beginning `01 11`, followed by ASCII `LOCK_WAITING_TOKEN`.
5. Write bytes `01 02 31 32 33 34 35 36` (`version 0x01`, command `0x02`, ASCII `123456`).
6. Expect notification bytes beginning `01 12`, followed by ASCII `UNLOCK_OK`, and GPIO5 actuator LED solid ON for 10 seconds, then OFF.
7. Wrong token example: write `01 01`, then `01 02 30 30 30 30 30 30`; expect `01 13` / `UNLOCK_DENIED` and no actuator LED ON hold.

The hardcoded token is intentionally fake and must remain marked as security debt. BLE transport,
the test token, and this local state machine are not production authorization.

**Known gaps to resolve before this protocol is production-ready:**
- BLE encryption is only the current MVP baseline; it is not real mutual app/lock
  authentication and does not replace backend signed token verification.
- `OPEN_SESSION` currently accepts an unverified role/session payload after encryption; replace it
  with an authenticated, backend-issued grant tied to a hardware-backed app identity.
- No structured payload format beyond command byte + raw payload - needs a real schema
  (e.g. length-prefixed or TLV) once OTP, tokens, and richer status data need to be carried.
- The current bench role is explicit but not cryptographically bound to a user/request; production
  role identification must be tied to the phone's authenticated identity and backend request.
- BLE-only MVP has no independent proximity factor and no relay-resistant ranging. Do not market
  or treat it as production-grade physical presence proof without an approved mitigation.

## Versioning rule

Once frozen, protocol changes must be additive/versioned, not silently breaking. Any breaking
change requires a version bump and a documented compatibility/migration plan here.
