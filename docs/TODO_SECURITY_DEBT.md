# Security Debt Tracker

Every intentionally fake, simulated, or incomplete security-relevant item in the codebase must be
listed here, dated, and cross-referenced to its `SECURITY-PLACEHOLDER` comment in code (see
`SECURITY_RULES.md` for the marker convention). Nothing on this list may be treated as
production-ready. Review this file before every release and before any pilot/customer deployment.

## Format

| ID | Item | Introduced (phase/date) | Location | Must be resolved by | Status |
|---|---|---|---|---|---|

## Current entries

| ID | Item | Introduced | Location | Must be resolved by | Status |
|---|---|---|---|---|---|
| SD-001 | Actuation uses an unconnected bench relay, not a production lock mechanism; solenoid/load is disconnected | Hardware MVP Phase 1 | `led_control.c`, `docs/HARDWARE_REFERENCE.md` | Before any pilot hardware build | Open |
| SD-002 | Lock actuation triggered by local FSM state after a simulated token match, not yet a verified signed backend token | Hardware MVP Phase 3 | `lock_logic.c` | Before any network/backend integration is considered complete | Open |
| SD-003 | Simulated backend token is hardcoded (`123456`), not backend-issued or signed | Hardware MVP Phase 3 / Mobile MVP Phase 1 | `lock_logic.c`, `mobile/src/ble/lockProtocol.js` | Before any network/backend integration is considered complete | Open |
| SD-004 | No real token verification / crypto - TODO markers only | Hardware MVP Phase 5-6 | `lock_logic.c` | Before any network/backend integration is considered complete | Open |
| SD-005 | BLE GATT UUIDs are temporary/placeholder | Hardware MVP Phase 2 | `ble_service.c`, `BLE_PROTOCOL.md` | Before protocol freeze / before app integration | Open |
| SD-006 | BLE uses MVP Just Works encryption/bonding scaffolding, not production mutual authentication or app identity binding | Hardware MVP Phase 2-3 | `ble_service.c` | Before any pilot/customer-facing build | Open |
| SD-007 | MVP proximity/presence relies on BLE session/app authentication only; no RFID/NFC tap factor and no relay-attack-resistant ranging | Hardware MVP scope change 2026-07-17 | `ble_service.c`, `lock_logic.c`, hardware design | Before banking customer pilot, or explicitly accepted as a documented residual risk | Open |
| SD-008 | Local Wi-Fi/MQTT telemetry and grant delivery are now wired, but production device provisioning, certificate rotation/revocation, and network hardening remain open | Hardware MVP / Phase 5 | `src/device_gateway.c`, `infra/mosquitto/` | Before any pilot/customer-facing build | Open |
| SD-009 | No OTA update mechanism - acceptable for MVP, but flagged so it isn't added later without signing/rollback protection | N/A (absence is intentional) | N/A | Before any OTA feature is added | Open (by design) |
| SD-010 | RFID/NFC prototype firmware was removed from the active MVP code path | Hardware MVP scope change 2026-07-17 | N/A | Reopen only if RFID/NFC hardware returns to scope | Resolved 2026-07-17 |
| SD-011 | Bench `OPEN_SESSION` accepts role/session ID without a signed backend grant or hardware-backed identity proof | Two-phone BLE session foundation 2026-09-25 | `lock_logic.c`, `mobile/src/App.js`, `mobile/src/ble/lockProtocol.js`, `BLE_PROTOCOL.md` | Before any pilot/customer-facing build | Open |
| SD-012 | Mobile UI uses local bench buttons/timer for administrator approval and dual-presence verification until backend events exist | Mobile mockup port 2026-09-25 | `mobile/src/App.js` | Before any pilot/customer-facing build | Open |
| SD-013 | Production provider adapters for OIDC/MFA, MQTT/TLS device identity, mobile delivery, and KMS/HSM signing are not complete; local adapters are configured only for development | Backend foundation 2026-09-25 | `backend/core/providers.py`, `infra/` | Before any pilot/customer-facing build | Open |
| SD-014 | Dashboard fixtures were replaced by tenant-scoped API data; the local dashboard still depends on the development OIDC/session profile | Admin dashboard Phase 4 2026-09-25 | `dashboard/lib/api.ts`, `dashboard/components/dashboard-shell.tsx` | Before any pilot/customer-facing build | Resolved (live API path; production auth remains open) |
| SD-015 | Django development secret fallback, local Keycloak realm, and session bridge are local-only; production OIDC/MFA policy is not wired | Backend foundation 2026-09-25 | `backend/access_lock/settings.py`, `infra/keycloak/` | Before any dashboard deployment | Open |
| SD-016 | Local signing uses an ES256 development adapter with a generated ignored P-256 private key; it is not cloud KMS/HSM signing | Local integration profile 2026-09-25 | `backend/core/providers.py`, `docker-compose.yml`, `src/grant_verifier.c` | Before any pilot/customer-facing build | Open |
| SD-017 | FCM integration is notification-only until authenticated mobile device enrollment and OTP retrieval are implemented and tested; local runs use a wake-up outbox substitute | Local integration profile 2026-09-25 | `backend/core/providers.py`, `backend/core/models.py` | Before any pilot/customer-facing build | Open |
| SD-018 | Local Mosquitto uses self-signed certificates and a sample lock identity; production CA, rotation, revocation, and per-lock provisioning remain open | Local integration profile 2026-09-25 | `infra/mosquitto/` | Before any pilot/customer-facing build | Open |
| SD-019 | Local mobile OIDC subject mapping and auto-enrollment are demo-only; hardware-backed device attestation and reviewed re-enrollment are not implemented | Local mobile integration 2026-09-25 | `backend/core/authentication.py`, `backend/core/mobile_views.py`, `mobile/src/auth/accessLockAuth.js`, `infra/keycloak/` | Before any pilot/customer-facing build | Open |
| SD-020 | Mobile OTP retrieval now returns the OTP only to the authenticated second-party device, but local envelope key handling and hardware-backed device binding remain development-only | Mobile API Phase 3 2026-09-25 | `backend/core/otp.py`, `backend/core/mobile_views.py` | Before any pilot/customer-facing build | Open |
| SD-021 | ESP32 local demo configuration embeds sample mTLS device credentials and the development public verification key in an ignored generated header; production secure provisioning and key storage are not implemented | Phase 5 2026-09-25 | `scripts/prepare-esp32-demo.ps1`, `include/demo_device_config.h` | Before any pilot/customer-facing build | Open |
| SD-022 | Local-demo Android release APK trusts user-installed CA certificates so the workstation's generated HTTPS CA can be used; production must pin a managed CA or platform trust chain | Local HTTPS mobile integration 2026-09-25 | `mobile/android/app/src/main/res/xml/network_security_config.xml` | Before any pilot/customer-facing build | Open |
| SD-023 | Temporary bench firmware pulses the relay GPIO directly without a signed grant; test-only image must never be used as lock firmware | Relay bench test 2026-10-01 | `hardware_tests/relay_gpio5_blink/src/main.c` | Remove the temporary bench test after relay verification | Open (bench-only) |

## Process

- Add a new row the moment a placeholder is introduced - not retroactively.
- When resolving an item, don't delete the row - mark `Status` as `Resolved (date, commit)` so
  there's a durable record that it existed and was deliberately addressed, useful for audit
  purposes given the banking-vertical target.
- If an item is deliberately deferred past its original "must be resolved by" milestone, note why
  and get explicit sign-off rather than silently letting the deadline slip.
