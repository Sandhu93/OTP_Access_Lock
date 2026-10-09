# Architecture Rules

## System components

1. **Lock firmware** (ESP32-S3, ESP-IDF + PlatformIO) - low-trust edge device. Verifies signed
   tokens, drives the actuator (currently simulated with LEDs), runs a local BLE GATT peripheral,
   keeps a small local tamper log, talks to the backend over WiFi. RFID/NFC is deferred and not
   part of the current MVP path.
2. **Mobile app** (Person A/B/C) - BLE central to the lock, authenticated client to the backend,
   holds hardware-backed identity key, biometric-gated.
3. **Backend** - system of record: identity, enrollment, policy (N-of-M), admin review workflow,
   OTP issuance, signed token issuance, audit log, multi-tenant data isolation.
4. **Admin dashboard** - a client of the backend; no independent trust logic of its own.

## Where logic lives

- **Authorization decisions live on the backend, not the lock, not the app.** The lock's job is to
  verify a signed token and act on it - it should not independently decide "these two people are
  present, therefore unlock." The app's job is to be a faithful transport/UI layer for the
  person's actions, not to make trust decisions.
- **The lock is deliberately kept as simple/dumb as possible** on the authorization path, so the
  auditable, patchable logic stays centralized on the backend. Resist the temptation to add
  "smart" unlock decisions to firmware for convenience.

### BLE session ownership

- `ble_service` owns transport connection slots, connection handles, encryption state,
  notification subscription state, and per-connection response buffers. It must not infer user
  identity or authorization from connection order.
- `lock_logic` receives the connection handle with each transport write and tracks the current
  bench session association needed to keep requester and approver traffic separate. This local
  association is not a production authorization decision and must be replaced with verification
  of a backend-issued session grant before pilot use.
- The mobile app maintains one BLE central session to the lock and one authenticated backend
  session. It must not create a direct app-to-app BLE link for authorization.
- The backend owns transaction state, admin decision, OTP validation, simultaneous-presence checks,
  and signed-token issuance. The lock only verifies the signed token before actuation.

## Firmware module boundaries (current + planned)

- `led_control` - GPIO-level actuator control (LED today, physical lock actuator later). Knows
  nothing about BLE or business logic.
- `rfid_reader` - deferred/non-MVP module. Existing WS1850S code is retained only as prototype
  reference unless the hardware scope is explicitly reopened. It must not be wired into the MVP
  unlock flow.
- `ble_service` - NimBLE GATT peripheral. Exposes connection/write/notify events. Knows nothing
  about lock state, tokens, or OTPs - it's a transport.
- `lock_logic` - the state machine. It owns BLE session association and exposes the current
  session context to the grant verifier, but it never authorizes actuation from BLE alone.
- `device_gateway` - Wi-Fi + MQTT 5/TLS client. It owns reconnect handling, telemetry publishing,
  command subscription, and delivery of verified-grant results to the actuator callback. It does
  not make authorization decisions.
- `crypto`/`grant_verifier` - signature verification, key handling, claim validation, and nonce
  freshness. It is isolated so it can be reviewed/audited as its own unit and depends only on
  the lock session context for presence-ID checks.

**Rule:** lower-level modules (`led_control`, `ble_service`, `device_gateway`, and any future
`rfid_reader` reactivation) must never import or call into `lock_logic`. Dependencies flow one
direction, up into `lock_logic`. Communication from `lock_logic` down to peripherals is direct
function calls; communication from peripherals up to `lock_logic` is via the event
queue/event-group pattern established during the hardware MVP phase, not direct callbacks that
couple modules together.

## Adding a new module

Before adding a new module or crossing an existing boundary, state in the PR/commit description:
what it depends on, what depends on it, and confirm it doesn't violate the one-directional
dependency rule above. Update this file if the module list changes.

## Backend/app architecture

The first backend milestone is a modular Django + Django REST Framework monolith. It owns the
system of record and exposes separate tenant-scoped admin, mobile, and device boundaries. The
dashboard is a React/Next.js client and contains no authorization logic of its own.

The initial backend modules are `tenants`, `admins`, `users`, `devices`, `sites`, `lockers`,
`policies`, `unlock_requests`, `otp`, `presence`, `tokens`, `device_gateway`, `audit`, and
`alerts`. PostgreSQL is the durable source of truth; Redis is limited to ephemeral coordination,
rate limits, idempotency, and fan-out. MQTT 5 over TLS is the device transport. OIDC with mandatory
MFA authenticates admins. KMS/HSM signs unlock grants; signing keys never enter application config.

Every tenant-owned table carries `tenant_id`. Tenant authorization is enforced in application
services and at the PostgreSQL row-security boundary. The backend owns transaction state, admin
decisions, OTP validation, simultaneous-presence checks, signed-token issuance, and audit events.
See `docs/API_CONTRACT.md` and `docs/DEVICE_MQTT_PROTOCOL.md` for the initial contracts.
