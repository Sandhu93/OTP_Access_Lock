# Backend and admin dashboard architecture

Status: **Phase 1 foundation implemented; production integrations remain open.**

The control plane is a Django + Django REST Framework modular monolith backed by PostgreSQL.
The admin dashboard is a separate Next.js/TypeScript client. The mobile app remains a separate
React Native client. Authorization decisions stay in the backend; the dashboard is not an
independent trust boundary.

## Runtime components

```text
Admin browser ── OIDC/MFA ──> Next.js dashboard ── authenticated API ──> Django control plane
Mobile app ───────────────── authenticated API ──> Django control plane
ESP32 lock ── MQTT 5/TLS ──> device gateway ──> Django transaction services
                                      │
                                      ├── PostgreSQL: system of record
                                      ├── Redis: short-lived coordination and queues
                                      └── KMS/HSM: signing operations only
```

The current implementation contains the Django domain model, tenant-scoped API skeleton, review
endpoints, OTP lifecycle primitive, audit event writer, and a generic dashboard in demo mode. The
OIDC provider, authenticated mobile channel, MQTT broker/certificate provisioning, KMS/HSM signer,
and production PostgreSQL row-level-security session binding are not wired yet.

## Tenant isolation

Every tenant-owned entity has a `tenant` foreign key. API querysets are scoped through the active
administrator's `AdminMembership`; a tenant ID supplied by an ordinary administrator is never
trusted. PostgreSQL row-level security must be enabled before production and applied using a
transaction-scoped tenant context. The application-level queryset scope is defense in depth, not
a substitute for database policy.

## Authorization flow

1. Mobile submits an authenticated unlock request and receives a backend-generated request ID.
2. The backend records the request as `pending_review` and emits an audit event.
3. An administrator reviews the request and records an approval/rejection reason.
4. Approval creates a one-minute, single-use OTP challenge for the selected second party. The OTP
   is sent through the authenticated mobile channel; the dashboard does not display it.
5. The backend verifies the second party's active lock session, OTP status, retry count, and the
   first party's current presence.
6. Only after all checks pass does a KMS/HSM-backed signer create a nonce-bound, short-lived token.
7. The device gateway delivers the signed token over authenticated MQTT/TLS. The lock verifies
   the token locally and actuates; BLE presence alone never authorizes actuation.

## API boundary

The mobile app and dashboard consume the same versioned API namespace. The dashboard may use
server-side reads or route handlers later, but authorization remains in Django. The current
endpoints are documented in `backend/README.md` and are intentionally read/review focused.

## Production gates

- OIDC issuer, audience, nonce/state validation, MFA policy, logout, and key rotation.
- PostgreSQL RLS policies tested with cross-tenant access attempts.
- Device certificate enrollment, revocation, MQTT ACLs, QoS/idempotency, and offline behavior.
- KMS/HSM signing key ownership, rotation, public-key provisioning, and firmware verification.
- Authenticated mobile push/channel for OTP delivery; no OTP in dashboard responses or logs.
- Append-only audit storage with reviewed hash-chain/export/retention behavior.
- End-to-end tests across dashboard, API, mobile, broker, and lock firmware.
