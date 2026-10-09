# Data Model

Status: **implemented foundation / production isolation and provider integrations pending.** The
canonical Django schema and initial migration live in `backend/core/models.py` and
`backend/core/migrations/0001_initial.py`. PostgreSQL row-level security, production migration
operations, and external provider integrations remain open security work.

## Core entities

### Tenant
A customer organization. All data below is scoped to a tenant; isolation is enforced at the data
layer, not just in application logic.
- `tenant_id`
- `name`
- `industry` (e.g. banking — drives which compliance rules apply, see `COMPLIANCE_NOTES.md`)

### Site
A physical location grouping multiple lockers, used for regional/fleet management.
- `site_id`, `tenant_id`
- `name`, `address`/`region`

### Locker
A single physical hardware unit.
- `locker_id`, `site_id`, `tenant_id`
- `hardware_id` (maps to the physical ESP32 device identity)
- `policy` — N-of-M configuration (see Policy below)
- `status` — online/offline, battery level, last-seen timestamp
- `enrolled_users` — up to 3 (see LockerEnrollment below)

### EnrolledUser
An enrolled person (Person A/B/C role, not the IT admin).
- `user_id`, `tenant_id`
- `oidc_subject` — local/demo identity mapping; production mobile identity must be bound to a hardware-backed device enrollment
- `name`, `employee_id`/`role_title` (informational only — not a trust factor)
- `status` — active / revoked

### AdminUser
IT admin account. Distinct from `User` — different permission model, dashboard access, does not
by default hold locker-unlock trust itself.
- `admin_id`, `tenant_id`
- `name`, `auth credentials` (handled per `SECURITY_RULES.md` — never plaintext, never logged)

### TenantMembership
The explicit relationship between an OIDC-authenticated admin identity and a tenant.
- `tenant_id`, `admin_user_id`
- `oidc_subject`, `role` (owner / admin / operator / viewer), `active`

### Device (phone)
The hardware-backed identity bound to a `User` during enrollment.
- `device_id`, `user_id`
- `public_key` / `attestation` reference (hardware-backed keystore key, not a session token)
- `enrollment_status` — pending admin approval / active / revoked
- `enrollment_history` — re-enrollment events, each requiring the other trusted party's
  involvement per `SECURITY_RULES.md`

### LockerEnrollment
Join entity: which users are enrolled to which locker, and their role in that locker's policy.
- `locker_id`, `user_id`
- `enrolled_at`, `enrolled_by` (admin_id)

### LockerPolicy (N-of-M)
Per-locker configuration.
- `locker_id`
- `m` — total enrolled users (max 3)
- `n` — required simultaneous approvers (min 2, admin-configurable up to `m`)

### UnlockRequest
One attempted transaction.
- `request_id`, `locker_id`, `tenant_id`
- `requester_user_id`
- `requested_at`
- `admin_review_status` — pending / approved / rejected
- `admin_id`, `admin_reason_notes`, `reviewed_at`
- `second_party_user_id` (who the OTP was issued to)
- `otp_issued_at`, `otp_expires_at`, `otp_attempts`
- `outcome` — actuated / timed_out / aborted / otp_lockout / rejected
- `token_id` (if a signed token was issued — see Token below)

### SignedUnlockGrant (Token)
The signed, short-lived authorization issued to a lock.
- `token_id`, `request_id`, `locker_id`
- `nonce`, `issued_at`, `expires_at`
- `signature` reference (never store raw signing key material here — see `SECURITY_RULES.md`)

### OtpChallenge
The backend-owned, single-use challenge created after admin approval.
- `request_id`, `recipient_user_id`
- `otp_hash`, `otp_salt`, `issued_at`, `expires_at`
- `attempts`, `max_attempts` (default 2), `locked_at`, `verified_at`
- raw OTP value is never stored or returned to the dashboard

### Device push registration

An enrolled mobile device may hold an FCM registration token used only to wake the authenticated
mobile channel when an OTP challenge is ready. The notification contains no OTP. Tokens are
revocable and must be replaced on app reinstall or provider rotation; production storage and
access controls require review before pilot deployment.

### PresenceSession
An authenticated, active BLE/presence session associated with a request.
- `session_id`, `request_id`, `user_id`, `locker_id`
- `ble_session_id`, `authenticated_at`, `last_heartbeat_at`, `ended_at`

### SecurityAlert / OutboxMessage
`SecurityAlert` represents tenant-scoped tamper, lockout, connectivity, or emergency events.
`OutboxMessage` supports durable publication of backend events after the source transaction commits.
Neither is an authorization source; signed grants remain the only actuation trust anchor.

### AuditLogEntry
Full event trail — see `COMPLIANCE_NOTES.md` for tamper-evidence and retention requirements.
- `entry_id`, `tenant_id`, `related_request_id` (nullable — some entries are enrollment/admin
  actions unrelated to a specific unlock request)
- `event_type`, `timestamp`, `actor` (user/admin/system), `details`
- `hash_chain_prev` — for tamper-evident, write-once logging

### EmergencyOverrideEvent
Logged whenever the two-key physical override is used.
- `event_id`, `locker_id`, `tenant_id`
- `timestamp` (from lock's local clock if offline, reconciled later)
- `reported_via` — local-log-sync vs. real-time, if it occurred during an outage

## Open questions to resolve before production rollout

- Exact auth/session model for `AdminUser` and for `EnrolledUser` app-to-backend API calls.
- Where signing keys for `Token` actually live (KMS/HSM candidate, not yet decided).
- Retention period and deletion policy per entity, per `COMPLIANCE_NOTES.md` and applicable
  regulation once first banking customer's specific requirements are known.
- Whether `GPS` data is captured at all (per earlier decision, this should be an optional,
  per-tenant-configurable field, off by default — see `SECURITY_RULES.md`/privacy discussion).
