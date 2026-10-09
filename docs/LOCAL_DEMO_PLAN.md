# Local End-to-End Demonstration Plan

Status: **Phase 1-4 complete / Phase 5 and Phase 6 local integration implemented; physical rehearsal pending**

Current implementation snapshot: the local containers, Keycloak realm, tenant bootstrap, OIDC
bearer validation, tenant-scoped mobile routes, device registration boundary, presence-session
routes, unlock-request route, OTP verification, live dashboard data, and React Native API boundary
are active. The physical two-phone happy path is not complete until mobile PKCE/token storage,
BLE-to-API UI wiring, FCM credentials, and ESP32 MQTT grant handling are implemented.

This plan defines a repeatable local demonstration across two Android phones, the Django control
plane, the admin dashboard, and an ESP32-S3. It is a demonstration environment, not a production
deployment. Every local security substitute remains explicitly labelled and tracked in
`TODO_SECURITY_DEBT.md`.

## Demonstration boundary

The local flow is:

```text
Person A mobile
  -> BLE presence + authenticated API request
Django backend
  -> live request
Admin dashboard
  -> approval with reason
Django backend
  -> FCM wake-up event (never the OTP)
Person B mobile
  -> authenticated challenge retrieval + OTP verification
Django backend
  -> local development signed grant over MQTT/mTLS
ESP32-S3
  -> grant verification + LED actuation + telemetry
Dashboard
  <- live status and audit event
```

The demo uses fake tenant/users, local Keycloak, PostgreSQL, Redis, Mosquitto mTLS, an explicit
development signer, and the ESP32 LED as the actuator. It must not be described as production
security. Local MFA is disabled only for the demo realm; production must enforce MFA.

## Phase 1 — Local demonstration profile

### Infrastructure

- [x] Docker Compose services for PostgreSQL and Redis.
- [x] Local Keycloak realm and dashboard OIDC entry point.
- [x] Local Mosquitto listener with generated CA, backend, and demo-lock certificates.
- [x] API health check and development tenant bootstrap.
- [x] Explicit development signing adapter.
- [x] Security-debt entries for local signer, FCM notification-only delivery, and self-signed MQTT.
- [ ] Set `DEMO_MQTT_BIND_ADDRESS=0.0.0.0` for ESP32 LAN access and document the Windows Firewall rule.
- [x] Add a single-command local demo smoke test (`.\scripts\local-demo-smoke.ps1`).

### Local run target

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\mosquitto\generate-certs.ps1
docker compose up -d --build
powershell -ExecutionPolicy Bypass -File .\scripts\local-demo-smoke.ps1
```

Dashboard: `http://localhost:3000/login`  
API: `http://localhost:8000`  
Keycloak: `http://localhost:8081`  
MQTT: `mqtts://localhost:8883`

## Phase 2 — Two authenticated mobile identities

### Identity and enrollment

- [x] Add separate local Keycloak identities for Person A and Person B.
- [x] Map OIDC `sub` values to tenant-scoped enrolled users.
- [x] Add mobile bearer-token validation using the Keycloak issuer/JWKS.
- [x] Add device registration with a revocable FCM token and public-key fingerprint.
- [ ] Keep hardware-backed key attestation as a production blocker; local identity mapping is demo-only.

### Mobile API

- [x] Implement authenticated presence-session create, heartbeat, and close routes.
- [x] Implement authenticated unlock-request creation and status retrieval.
- [ ] Implement authenticated encrypted OTP-challenge retrieval without returning the OTP to the dashboard.
- [ ] Implement OTP verification using the existing one-minute/two-attempt service.
- [ ] Reject requests from revoked devices or users outside the active tenant/locker enrollment.

### React Native client

- [ ] Add Android OIDC Authorization Code + PKCE login.
- [ ] Store access/refresh tokens only in Android-protected storage.
- [ ] Register the device and FCM token after login.
- [ ] Replace the Person A bench approval button with live request polling/events.
- [ ] Replace the Person B bench OTP path with the authenticated challenge flow.
- [x] Keep BLE transport separate from backend identity and authorization decisions.
- [x] Add the React Native backend client boundary for authenticated mobile API calls.

## Phase 3 — Live mobile APIs

- [x] Validate OIDC bearer tokens and require an active `X-Device-ID` after registration.
- [x] Create and heartbeat backend presence sessions for BLE-connected participants.
- [x] Create and poll tenant-scoped unlock requests from mobile clients.
- [x] Deliver a local wake-up event without putting the OTP in notification metadata.
- [x] Retrieve the OTP only for Person B's authenticated device and verify it once.
- [ ] Connect Android OIDC Authorization Code + PKCE and secure token storage to the visible app.
- [ ] Connect the real FCM listener and device token registration for two physical phones.

## Phase 4 — Live dashboard and approval

- [x] Replace dashboard fixtures with tenant-scoped API data.
- [x] Show backend-generated UUID request IDs; the dashboard creates no request IDs.
- [x] Show approval and delivery state, never the OTP.
- [x] Display device, lock, audit, and alert status from the API.
- [x] Add administrator revoke actions for enrolled people and devices at the API boundary.

## Phase 5 — ESP32-S3 device path

- [x] Add Wi-Fi and MQTT 5 client support to the demo firmware.
- [x] Generate local demo-lock certificate/key configuration and CA/public signing material without committing secrets.
- [x] Subscribe to the lock command topic with mTLS ACL enforcement and reconnect handling.
- [x] Verify ES256 grant signature, key ID, tenant/locker binding, request ID, expiry, nonce, and required BLE session IDs.
- [x] Use the local-demo large factory partition so the ESP32 image containing embedded demo certificates fits.
- [x] Actuate the LED only after grant verification; BLE bench token writes cannot actuate.
- [x] Publish telemetry and actuation/rejection events back to the backend gateway.

## Phase 6 — Rehearsal and failure demonstrations

The backend now issues a local signed grant after OTP verification and a fresh two-party presence
check, then publishes it to `locks/{tenant_id}/{locker_id}/commands`. A separate Django MQTT
consumer stores lock telemetry and events for the dashboard. The local signer is ES256 with an
ignored generated private key; production KMS/HSM integration is still required.

The happy path is complete only when Person A creates a live request, the admin approves it, Person B
receives and verifies the challenge, both BLE presence sessions remain active, the backend publishes
the signed local-demo grant, and the ESP32 LED actuates.

The rehearsal must also demonstrate fail-closed behaviour for an incorrect OTP, expired OTP, revoked
device, missing second-party presence, disconnected ESP32, invalid certificate, expired grant, and
wrong locker binding.

## Phone and ESP32 networking

For USB-connected Android phones:

```powershell
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```

The ESP32 cannot use `localhost`; it must use the PC's LAN address for MQTT, for example
`192.168.1.25:8883`. The Windows Firewall rule and Mosquitto host binding must be enabled only for
the local demonstration network. The base Compose profile binds MQTT to loopback. For the physical
demo, put `DEMO_MQTT_BIND_ADDRESS=0.0.0.0` in the local `.env`, then allow inbound TCP 8883 only
on the private network profile.

## Definition of done

- Person A and Person B use different enrolled accounts and devices.
- Person A creates a backend request from the mobile app.
- The request appears in the authenticated dashboard with a backend-generated ID.
- The admin approves it without seeing the OTP.
- Person B receives the FCM event and verifies the OTP in the app.
- Backend presence re-checks both parties.
- ESP32 receives and verifies the signed local-demo grant over MQTT/mTLS.
- ESP32 actuates the LED and reports telemetry.
- Dashboard shows the final audit event.
- All failure cases remain locked and are audited.
