# Backend and Admin Dashboard Architecture

Status: initial implementation foundation. This document describes the control-plane boundary;
it is not a claim that OIDC, KMS/HSM, MQTT, or production delivery infrastructure is configured.

## Runtime shape

```text
React/Next.js dashboard ─┐
React Native mobile app ─┼─ HTTPS/JSON + authenticated events ─ Django/DRF API
ESP32 lock ──────────────┘                                  │
                                                            ├─ PostgreSQL (source of truth)
                                                            ├─ Redis (short-lived coordination)
                                                            ├─ MQTT 5/TLS device gateway
                                                            └─ KMS/HSM signer
```

The first implementation is a modular Django monolith. It keeps authorization decisions in one
auditable deployment while leaving clear boundaries for a later device gateway or worker split.
The dashboard has no independent authorization logic; it calls the backend and renders responses.

## Trust boundaries

- OIDC authenticates admin accounts and supplies tenant/role claims. MFA is mandatory at the
  identity provider; the application must reject missing or untrusted claims.
- Every tenant-owned query is scoped by a server-derived tenant membership. A client-provided
  tenant ID is only a selector and never an authorization grant.
- PostgreSQL row-level security is a second isolation boundary for tenant-owned tables. The API
  must set the database tenant context for each transaction and use a non-owner application role.
- Redis may hold locks, idempotency keys, and ephemeral workflow state. It is never the source of
  truth for requests, OTP state, policy, or audit history.
- MQTT carries device telemetry and backend commands. It is transport only; the lock must verify
  the signed, nonce-bound, short-lived authorization token before actuation.
- KMS/HSM owns the private signing key. The Django process never reads or stores that key.

## Initial API surface

All routes are under `/api/v1/` and require an authenticated principal except `/healthz`.

| Route | Purpose |
|---|---|
| `GET /healthz` | Liveness/readiness metadata without secrets |
| `GET /admin/overview` | Tenant-scoped counts and active security alerts |
| `GET /admin/sites/` | List sites visible to the current admin |
| `GET /admin/lockers/` | List lockers, policy, connectivity, and last-seen status |
| `GET /admin/unlock-requests/` | Live approval queue, filterable by status |
| `GET /admin/unlock-requests/{id}/` | Request timeline and safe metadata; never returns OTP/token material |
| `POST /admin/unlock-requests/{id}/approve/` | Approve with reason and selected second party; triggers OTP issue workflow |
| `POST /admin/unlock-requests/{id}/reject/` | Reject with mandatory reason |
| `GET /admin/audit-events/` | Paginated tenant-scoped audit history |
| `GET /admin/alerts/` | Tamper, lockout, emergency, and device alerts |

The approval endpoint never returns an OTP. The backend generates a single-use OTP, stores only a
verifier, and dispatches it through the authenticated mobile channel. Delivery is currently an
explicit adapter boundary and fails closed until a real provider is configured.

## Transaction rules

1. A mobile request creates a backend-generated UUID request ID and an audit event.
2. An admin can approve only a pending request within the admin's tenant and assigned scope.
3. Approval requires a reason and an eligible second-party user.
4. OTPs have a one-minute expiry and two-attempt maximum. Only a verifier is persisted.
5. A second party must present an authenticated device and active BLE presence for the same lock.
6. The backend re-checks Person A's active presence immediately before token issuance.
7. The signer issues a nonce-bound token only after all policy checks pass.
8. MQTT publishes the signed token to the lock's device topic; the lock verifies it locally.
9. Every transition is idempotent, tenant-scoped, and appended to the audit trail.

## Not yet configured

- OIDC issuer, audience, claim mapping, and MFA policy
- PostgreSQL RLS migrations and production database role separation
- Redis deployment and distributed lock/idempotency policy
- MQTT broker, per-device certificates, topic ACLs, and reconnect semantics
- KMS/HSM provider, key algorithm, rotation, and firmware public-key update process
- Authenticated mobile event channel and push-notification provider

These are tracked as security debt and must not be replaced with local secrets or simulated
implementations that look production-ready.
