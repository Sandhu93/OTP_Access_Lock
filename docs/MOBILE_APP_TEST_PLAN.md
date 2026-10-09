# Mobile App Test Plan

The first mobile phase validates that a React Native BLE central can drive the firmware protocol
that was already proven with nRF Connect.

## Automated Tests

Run:

```powershell
cd mobile
npm test
```

Coverage:

- Command frames include protocol version byte.
- Bench requester/approver session frames include an explicit role and non-zero 8-byte session ID.
- Session heartbeat and close frames match the two-phone BLE protocol.
- Request unlock, submit simulated token, and cancel frames match `BLE_PROTOCOL.md`.
- Base64 conversion works without external helpers.
- Response frames decode status code and ASCII text.
- Malformed and unsupported response frames fail closed in app state.
- Non-ASCII token payloads are rejected by the protocol helper.

## Hardware Smoke Test

With the ESP32-S3 running the latest firmware:

1. Scan for `LOCK-TEST-01`.
2. Connect and allow Android pairing/bonding if prompted.
3. Confirm the firmware serial log reports `BLE encryption change ... encrypted=1`.
4. Select `Person A / Requester` and tap `Open bench session`.
5. Expect app status `SESSION_OPENED`.
6. Tap `Request Unlock`.
7. Expect app status `LOCK_WAITING_TOKEN`.
8. For the legacy single-phone bench path, switch to `Person B / Approver` only after closing the
   requester session, open an approver session, and tap `Submit Test Token`.
9. Expect app status `UNLOCK_OK` and GPIO5 solid ON for 10 seconds, then OFF.
10. Tap `Request Unlock`, then `Cancel Request` from an active requester session.
11. Expect `LOCK_CANCELLED` and no GPIO5 ON hold.

## Fault Checks

- Submit token from idle: expect `ERR_TOKEN_REQUIRED`.
- Disconnect after request, reconnect, submit token: expect `ERR_TOKEN_REQUIRED`.
- Wait more than 60 seconds after request, then submit token: expect `ERR_TIMEOUT`.
- If the app shows `ERR_UNENCRYPTED`, reconnect and confirm Android pairing/bonding completed.

## Two-phone session smoke test

1. Open a bench requester session from Phone A while connected.
2. Connect Phone B to the same lock and open a bench approver session.
3. Confirm each phone receives only its own response notifications.
4. Confirm Phone A can request and Phone B can submit the simulated token.
5. Disconnect either phone during a pending request and confirm the lock remains locked.
