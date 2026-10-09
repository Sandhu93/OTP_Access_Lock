# Product Context

## What this is

A commercial split-trust locker/safe system. No single person can open a locker alone - trust is
distributed across at least two enrolled users plus an IT admin review step. Target vertical:
banking, first. Designed to scale to hundreds of locks across multiple sites, multi-tenant across
customers.

## Actors

- **Enrolled user (Person A, B, optionally C)** - an employee with the app installed on a
  specific, admin-approved phone, enrolled to one or more specific lockers. Authenticates via
  app biometric/PIN and a BLE connection to the lock. RFID/NFC tap authentication is deferred
  and is not part of the current MVP.
- **IT admin** - manages the dashboard: enrolls/revokes users and phones, assigns users to
  lockers, manually reviews and approves/rejects unlock requests, configures per-locker N-of-M
  policy, views audit logs. Does not routinely see OTPs.
- **Backend / dashboard** - the system of record for identity, policy, tokens, and audit logs. All
  authorization decisions are made here, never solely on the lock or in the app.
- **Lock hardware** - ESP32-S3-based device per locker. Verifies signed tokens and actuates.
  Treated as a low-trust edge device: it enforces what the backend tells it, and independently
  keeps its own small local tamper log, but it is not where authorization logic lives.

## Trust model

Distributed three-party trust: Person A + Person B (or C) + IT admin. Default policy is 2-of-3
enrolled users required, admin-configurable per locker up to 3-of-3 or other N-of-M combinations,
depending on customer risk tolerance. A locker supports a maximum of 3 enrolled users.

The IT admin's manual review is a real control, not a rubber stamp: admin asks the requester for
a reason, logs it, and can reject. Admin approval does not by itself unlock anything - it only
authorizes OTP issuance to the second party.

## Core transaction flow

1. **Provisioning (one-time, per user/locker):** Admin enrolls a phone to a locker. App
   install/activation requires admin approval. Phone identity is bound to a hardware-backed
   keystore key; app itself requires biometric/PIN to open.
2. **Request:** Person A arrives at the locker, opens app, BLE-connects and mutually authenticates
   with the lock, then sends an unlock request to the backend.
3. **Admin review:** Backend notifies the dashboard. Admin asks reason, logs it, approves or
   rejects.
4. **OTP issuance:** On approval, backend generates a single-use OTP (1-minute TTL) and pushes it
   to the second required party's (Person B's) app over an authenticated in-app channel.
5. **Second presence:** Person B arrives at the same locker, BLE-connects, mutually authenticates,
   and enters the OTP. Max 2 wrong attempts before lockout + admin alert.
6. **Simultaneous presence check:** Backend confirms Person A is still actively connected to the
   lock at this moment - not just that they were present earlier.
7. **Token issuance:** Backend validates everything and issues a signed, nonce-bound,
   short-expiry unlock token to the lock.
8. **Actuation:** Lock verifies the token cryptographically and actuates. BLE connection state is
   never itself the authorization - see `SECURITY_RULES.md`.
9. **Logging:** Lock writes to its own small local tamper-evident log; backend writes the full
   event to its hash-chained audit log.

## Emergency override

Physical emergency key access uses a two-key setup (not a single bypass key). Using it is
logged locally on the lock even without connectivity and reported to the dashboard, and triggers
an automatic alert.

## Offline behavior

Outside business hours or when the backend is unreachable, lockers fail closed. A documented
offline fallback procedure exists (emergency key path) rather than any auto-approval.

## Glossary

- **Locker** - a single physical hardware unit (safe/cabinet) with its own lock and up to 3
  enrolled users.
- **Site** - a physical location grouping multiple lockers, used for regional/fleet management.
- **Policy (N-of-M)** - how many of the enrolled users on a locker (M, max 3) must jointly approve
  an unlock (N), admin-configurable per locker.
- **Token** - the signed, nonce-bound, short-expiry authorization the backend issues to a lock as
  the sole basis for actuation.
- **BLE presence (MVP)** - active authenticated BLE session between an enrolled phone and the
  lock. This is a local signal and transport, not the cryptographic authorization to actuate.
  It is not relay-attack-resistant by itself.
- **Enrollment** - the process of binding a specific phone (hardware-backed key) to a specific
  person and locker, requiring admin approval.
- **Re-enrollment** - required on phone loss, reset, SIM swap, or app reinstall; requires the
  other trusted party's involvement, not just admin action alone.
- **Tenant** - a customer organization; data and lock fleets are fully isolated per tenant.
