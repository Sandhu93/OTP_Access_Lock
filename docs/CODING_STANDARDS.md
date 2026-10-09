# Coding Standards

## Firmware (ESP32-S3, ESP-IDF + PlatformIO)

- **Framework:** ESP-IDF via PlatformIO, not Arduino framework.
- **BLE:** use NimBLE, not Bluedroid - lighter weight, better suited to this use case.
- **I2C:** use the new I2C master driver (`driver/i2c_master.h`), not the legacy `driver/i2c.h`,
  if any future hardware module needs I2C. RFID/NFC is deferred for the current MVP.
- **Concurrency:** BLE event handling, lock state transitions, and any future peripheral polling
  must communicate through the established event queue/event group, not direct cross-task
  function calls.
- **Error handling:** use `ESP_ERROR_CHECK` for unrecoverable init failures only. For runtime
  faults that should be handled gracefully (e.g. BLE disconnect, backend timeout), return error
  codes and handle them explicitly - the device should degrade/retry, not crash, wherever
  possible outside of init.
- **Logging:** use `ESP_LOGE/W/I/D/V` with a consistent tag per module (e.g. `"BLE_SERVICE"`,
  `"LOCK_LOGIC"`). `ESP_LOGI` for state transitions and normal operation, `ESP_LOGE` for faults,
  `ESP_LOGD/V` for verbose debug not meant for production builds. Never log secrets - see
  `SECURITY_RULES.md`.
- **Watchdog:** long-running tasks and the main loop must be registered with `esp_task_wdt` once
  the hardening phase is reached; don't remove watchdog coverage for debugging convenience
  without re-adding it.
- **Comments:** mark all intentionally fake/simulated logic with the `SECURITY-PLACEHOLDER`
  convention from `SECURITY_RULES.md`. Mark other known-incomplete logic with a plain `// TODO:`
  and enough context for a future session to understand it without re-deriving it.
- **Naming:** `snake_case` for functions and variables, `UPPER_SNAKE_CASE` for constants/macros,
  module-prefixed function names (e.g. `ble_service_start`) to keep call sites self-documenting.

## Mobile app

- **Framework:** React Native, Android-first during MVP. Use Android Studio as the native
  build/debug tool, not as the primary app framework.
- **BLE:** use `react-native-ble-plx` for central-role BLE. Keep firmware protocol encoding and
  decoding isolated in a testable module; UI components must not hand-build byte arrays inline.
- **Security placeholders:** hardcoded simulated tokens must carry the `SECURITY-PLACEHOLDER`
  marker and be listed in `TODO_SECURITY_DEBT.md`.
- **Logging/UI:** do not display or log real tokens/OTPs once backend integration begins. During
  MVP, status text and protocol bytes may be shown only for bench testing.
- **UX:** keep the lock-control UI quiet and operational: clear connection status, explicit
  commands, minimal decoration, and enough whitespace to avoid accidental taps.
- **Future hardening:** biometric/PIN gating and hardware-backed identity storage are required
  before pilot/customer builds; do not treat BLE pairing as user authentication.

## Backend

- **Framework:** Python with Django and Django REST Framework. Start as a modular monolith.
- **Database:** PostgreSQL; every tenant-owned table carries `tenant_id` and is protected by
  service-layer authorization plus database row-level security.
- **Admin auth:** OIDC with mandatory MFA. Do not add a new password flow in the application.
- **OTP:** generated with a cryptographically secure source, stored only as a hash, one-minute
  expiry, two-attempt maximum, and never returned to the dashboard.
- **Signing:** KMS/HSM adapter only; never place a private signing key in source, environment
  variables, or the database.
- **Device transport:** MQTT 5 over TLS with per-lock certificates and topic ACLs. MQTT is not an
  authorization decision.
- **Testing:** domain state transitions and security invariants must be unit-tested without live
  providers; provider adapters require integration tests before production use.

## General, all codebases

- Don't introduce a new dependency without a one-line justification in the commit/PR description.
- Don't silently change a public interface (GATT characteristic, API endpoint, data model field)
  - update the relevant doc (`BLE_PROTOCOL.md`, `DATA_MODEL.md`) in the same change.
- Prefer explicit, readable code over clever/compact code - this codebase will be read by future
  auditors and reviewers, not just developers.
