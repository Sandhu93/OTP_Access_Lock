# Phase 2 BLE Test Plan

This phase validates BLE transport plus the first placeholder command/state-machine integration.
It does not implement real unlock authorization, pairing policy, or backend token verification.

The two-phone extension also validates that the ESP32 keeps independent BLE transport/session
state for a requester and an approver. Role is explicit in the bench session frame; it is not
inferred from connection order and is not production identity proof.

## Automated Native Tests

Run:

```powershell
pio test
```

Coverage:

- BLE advertised device name remains `LOCK-TEST-01`.
- BLE event names used in logs are stable.
- BLE payload validation accepts bounded non-empty payloads.
- Empty, null, and oversized payloads are rejected.
- Hex formatting for serial logs is uppercase, space-separated, null-terminated, and safe under
  truncation.
- Notification state is true if notify or indicate is enabled.
- Lock logic starts idle.
- Empty payloads, unknown commands, malformed command payloads, and null contexts fail closed.
- `REQUEST_UNLOCK` moves to waiting-for-token without actuation.
- `SUBMIT_TOKEN` cannot actuate from idle.
- Wrong token denies and resets to idle.
- Correct simulated token actuates only after a pending request.
- `CANCEL` resets pending requests.
- Unsupported protocol versions and one-byte frames fail closed.
- Pending requests expire after 60 seconds.
- Response frames include protocol version byte, response code byte, and optional ASCII text.
- MVP scope guard still requires backend tokens and keeps RFID/NFC disabled.

## Firmware Build Smoke Test

Run:

```powershell
pio run -e esp32-s3-devkitc-1
```

## Hardware Upload

Run:

```powershell
pio run -e esp32-s3-devkitc-1 -t upload --upload-port COMx
pio device monitor -p COMx -b 115200
```

Replace `COMx` with the board port.

## Phone Test With nRF Connect

1. Open nRF Connect and scan.
2. Find `LOCK-TEST-01`.
3. Connect.
4. Open the custom service `7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0001`.
5. Enable notifications on characteristic `7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0002`.
6. Pair/bond if nRF Connect prompts for it.
7. Wait for serial log `BLE encryption change ... encrypted=1`.
8. Write hex `01 01`.
9. Confirm notification starts with `01 11` and contains text `LOCK_WAITING_TOKEN`.
10. Write hex `01 02 31 32 33 34 35 36` (`version 0x01`, command `0x02`, ASCII `123456`).
11. Confirm notification starts with `01 12` and contains text `UNLOCK_OK`.
12. Confirm GPIO5 turns solid ON only after `UNLOCK_OK`, stays ON for 10 seconds, then turns OFF.

Failure paths to walk manually:

- Write before encryption completes: expect `ERR_UNENCRYPTED`, no GPIO5 ON hold.
- Write hex `01 02 31 32 33 34 35 36` from idle: expect `ERR_TOKEN_REQUIRED`, no GPIO5 ON hold.
- Write hex `01 7F`: expect `ERR_UNKNOWN_COMMAND`, no GPIO5 ON hold.
- Write hex `02 01`: expect `ERR_VERSION_UNSUPPORTED`, no GPIO5 ON hold.
- Write hex `01`: expect `ERR_BAD_PAYLOAD`, no GPIO5 ON hold.
- Write hex `01 01`, wait more than 60 seconds, then write the valid token: expect `ERR_TIMEOUT`, no GPIO5 ON hold.
- Write hex `01 01`, then `01 02 30 30 30 30 30 30`: expect `UNLOCK_DENIED`, no GPIO5 ON hold.
- Write hex `01 01`, then `01 03`: expect `LOCK_CANCELLED`, no GPIO5 ON hold.
- Start `REQUEST_UNLOCK`, disconnect from nRF Connect, reconnect, then submit token: expect `ERR_TOKEN_REQUIRED`, no GPIO5 ON hold.

## Two-phone Session Test

Use two physical Android phones, each running the mobile bench client.

1. Phone A scans for and connects to `LOCK-TEST-01`.
2. Wait for encryption, enable notifications, select `Person A / Requester`, and open a bench
   session.
3. Without disconnecting Phone A, scan from Phone B and connect to the same lock.
4. Wait for encryption, enable notifications, select `Person B / Approver`, and open a bench
   session.
5. Request unlock from Phone A. Confirm only Phone A receives the waiting response.
6. Submit the simulated token from Phone B. Confirm only Phone B receives the token response and
   the actuator LED follows the existing bench behavior.
7. Disconnect Phone B while a request is pending. Confirm the request resets and the actuator does
   not turn on.
8. Confirm Phone A remains connected after Phone B disconnects, and vice versa.
9. Attempt to open a second requester session. Expect `ERR_SESSION_CONFLICT`.

This test is required before treating the mobile session UI as connected to the multi-device
transport. It remains a bench test because role/session grants are not signed backend grants.

Expected serial logs:

- `Starting BLE GATT peripheral`
- `Advertising as LOCK-TEST-01`
- `BLE connect event`
- `BLE security initiate requested`
- `BLE encryption change`
- `BLE subscribe event`
- `GATT write`
- `BLE command handled`
- `GATT response notification queued`
- `BLE notify_tx event`

## Soak / Fault Test

Run for 5-10 minutes:

- Reconnect at least five times.
- Exercise valid unlock, wrong token, timeout, cancel, bad version, bad command, and token from
  idle.
- Confirm GPIO5 turns ON for 10 seconds only on `UNLOCK_OK`.
- Watch heartbeat free heap. It should stay stable across repeated connect/write/disconnect
  cycles.

Known security gaps for this phase are tracked in `TODO_SECURITY_DEBT.md`: temporary UUIDs, Just
Works BLE encryption as MVP scaffolding rather than production mutual authentication, and the
hardcoded simulated backend token.
