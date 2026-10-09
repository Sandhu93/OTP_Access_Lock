# Testing Rules

## What "done" means, per phase (firmware MVP)

A phase is not complete until its stated acceptance test passes on real hardware - not just
"compiles" or "looks right in code review." Specifically:

- **Hardware interfacing (LEDs):** verified via serial monitor output and observed physical LED
  behavior, not just code inspection. RFID/NFC tests are not required for the current MVP because
  that hardware path is deferred.
- **BLE:** verified via an independent BLE client (e.g. nRF Connect for Mobile), not just
  firmware-side logs - confirms the protocol actually works from a real central, not only from
  the firmware's own assumptions about itself.
- **Integration (BLE + state machine):** requires a soak test (minimum 5-10 minutes) with BLE
  connected/disconnected repeatedly, command paths exercised, free heap logged periodically, and
  checked for stability/leaks.
- **State machine phases (single-party, then dual-party):** every defined state transition must be
  manually walked at least once, including every failure/timeout/abort path, not just the happy
  path. Use the test scripts generated alongside each phase's build prompt.
- **Hardening phase:** requires forced-fault testing (e.g. BLE disconnects, malformed/out-of-order
  BLE commands, backend/token timeout simulation) to confirm graceful degradation rather than
  crash/undefined behavior.

## General principles

- Isolate failures by phase. If integration breaks, check whether the independent LED and BLE
  tests still pass before assuming the bug is in the integration itself.
- Keep a hardware test log: date, firmware commit hash, what was tested, pass/fail, and any
  anomalies. This becomes useful evidence of development rigor for a security product, even kept
  informally during MVP stage.
- Any test that exercises security-relevant logic (token verification, OTP handling, retry
  lockouts) must explicitly test both the correct-input and incorrect-input/attack-adjacent paths,
  not just the happy path.

## Backend/app testing (once that work begins)

- Unit tests required for all crypto/token logic and OTP logic specifically, given this is a
  security product - this is not optional/nice-to-have once real (non-placeholder)
  implementations land.
- Any change touching `SECURITY_RULES.md`-governed code requires a corresponding test
  demonstrating the security property still holds (e.g. token replay is rejected, expired token is
  rejected, wrong OTP count triggers lockout).
- Multi-tenant isolation must have explicit tests proving one tenant cannot read/affect another
  tenant's data, once the backend/data layer exists.

## Regression discipline

Before marking any `SECURITY-PLACEHOLDER` item in `TODO_SECURITY_DEBT.md` as resolved, the
replacement real implementation must pass the same test coverage the placeholder was standing in
for, plus whatever additional tests the real implementation's added complexity requires.
