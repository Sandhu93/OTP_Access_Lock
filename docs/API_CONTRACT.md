# Access Lock Backend API Contract

Status: **local integration profile connected / production providers not yet approved**.

The backend is the authorization source of truth. The admin dashboard and mobile app are clients;
neither client may approve, issue an OTP, or decide that a lock should actuate.

Request reads normalize an expired active request to the terminal `expired` state before returning
it. Mobile approved-request lists and presence creation must never make an expired request
actionable. OTP challenge retrieval and verification require the parent request to remain in
`approved_waiting_second_party`; an expired, rejected, locked, or otherwise stale challenge is
rejected without returning the OTP. Error responses include a machine-readable `error_code` so
clients can distinguish approval, expiry, and OTP lockout states.

## Service boundaries

- `admin/v1` — tenant-scoped dashboard operations for admins.
- `mobile/v1` — authenticated user/device operations from the mobile application.
- `device/v1` — lock telemetry, presence events, and signed-grant delivery through the MQTT gateway.
- `audit/v1` — read-only, tenant-scoped audit and security events.

All production routes require authenticated identity and explicit tenant membership. A development
tenant header must never be accepted in a production deployment.

## Admin endpoints

```text
GET    /api/v1/admin/overview
GET    /api/v1/admin/unlock-requests
GET    /api/v1/admin/unlock-requests/{request_id}
POST   /api/v1/admin/unlock-requests/{request_id}/approve
POST   /api/v1/admin/unlock-requests/{request_id}/reject
GET    /api/v1/admin/sites
POST   /api/v1/admin/sites
GET    /api/v1/admin/lockers
POST   /api/v1/admin/lockers
PATCH  /api/v1/admin/lockers/{locker_id}
GET    /api/v1/admin/users
POST   /api/v1/admin/users
POST   /api/v1/admin/users/{user_id}/revoke
GET    /api/v1/admin/devices
POST   /api/v1/admin/devices/{device_id}/revoke
POST   /api/v1/admin/enrollments
POST   /api/v1/admin/enrollments/{enrollment_id}/revoke
GET    /api/v1/admin/audit-events
GET    /api/v1/admin/alerts
```

Approval requires a reason note. The response contains the request state and OTP delivery status,
never the OTP value. Approval creates a single-use, one-minute OTP challenge for the eligible
second party. The dashboard must not display or transport the OTP.

## Mobile endpoints

```text
POST   /api/v1/mobile/presence-sessions
PATCH  /api/v1/mobile/presence-sessions/{session_id}/heartbeat
DELETE /api/v1/mobile/presence-sessions/{session_id}
POST   /api/v1/mobile/devices/register
POST   /api/v1/mobile/unlock-requests
GET    /api/v1/mobile/unlock-requests
GET    /api/v1/mobile/unlock-requests/{request_id}
GET    /api/v1/mobile/otp-challenges/{challenge_id}
POST   /api/v1/mobile/otp-challenges/{challenge_id}/verify
```

The local profile now validates OIDC bearer tokens and supports device registration, unlock-request
creation, participant presence sessions, heartbeats, and OTP verification. Mobile requests after
registration must send the active `X-Device-ID`; revoked devices are rejected. The challenge GET
decrypts the backend envelope only for the authenticated second-party device and returns the OTP to
that mobile client over the authenticated TLS API. It never appears in FCM metadata, the dashboard,
or backend logs.

The backend verifies the authenticated device identity, locker enrollment, active BLE/presence
session, request state, OTP hash, expiry, and retry count before issuing any signed grant.

The mobile unlock-request response includes `presence_session_id` for the requester-created
backend presence session. The requester must PATCH that session's heartbeat while the request is
active; local BLE heartbeats do not update the backend freshness timestamp.

After OTP verification and confirmation of the required fresh presence sessions, the local
integration profile creates a short-lived ES256 grant and publishes it to the lock's MQTT command
topic. The grant is an envelope containing the grant claims, `algorithm: ES256`, and a base64url
signature. The dashboard receives only request state and delivery status; it never receives the
OTP, grant signature, or raw MQTT command. The ESP32 validates the envelope, device and tenant
binding, request and expiry fields, nonce freshness, and every required BLE presence identifier
before allowing the actuator callback.

## State machine

```text
PENDING_REVIEW -> REJECTED
PENDING_REVIEW -> APPROVED_WAITING_SECOND_PARTY
APPROVED_WAITING_SECOND_PARTY -> OTP_LOCKED_OUT
APPROVED_WAITING_SECOND_PARTY -> EXPIRED
APPROVED_WAITING_SECOND_PARTY -> PRESENCE_VERIFYING
PRESENCE_VERIFYING -> TOKEN_ISSUED
PRESENCE_VERIFYING -> ABORTED
TOKEN_ISSUED -> ACTUATED
TOKEN_ISSUED -> EXPIRED
```

Every transition is transactional, idempotent where appropriate, tenant-scoped, and recorded in
the audit log. OTP verification and attempt increments must use a database row lock or equivalent
atomic update.

## Provider status

The local Docker profile includes Keycloak, Mosquitto mTLS, an FCM HTTP v1 adapter, and an explicit
development signing adapter. The FCM message is only a wake-up event; it carries a challenge ID
and expiry, never the OTP. Authenticated mobile device enrollment and OTP retrieval are still
required before this is an end-to-end mobile flow. Production requires an approved OIDC/MFA
provider, cloud KMS/HSM, managed MQTT CA/certificate lifecycle, and provider integration tests.
