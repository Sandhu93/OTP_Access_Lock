# Security Rules

This is a security product for a banking-first customer base. These rules override convenience,
speed, and any individual prompt's phrasing. If a request conflicts with this file, stop and ask
rather than proceeding.

## Non-negotiables

1. **Signed token is the sole actuation trust anchor.** The lock actuates only after verifying a
   backend-issued, signed, nonce-bound, short-expiry token. BLE connection state, RSSI, "the app
   said unlock," or any other signal is supporting evidence, never sufficient on its own. This
   applies even in test/demo firmware - placeholder logic must be clearly marked (see below), not
   silently treated as equivalent.
2. **OTPs are single-use, 1-minute TTL, max 2 wrong attempts.** A 2nd wrong attempt aborts the
   flow and triggers an admin alert. OTPs are delivered only inside the app over an authenticated
   channel. Admin generates and dispatches OTPs via the dashboard; admin does not read OTPs aloud
   or relay them as a routine path.
3. **Phone identity is bound to a hardware-backed keystore / secure enclave key**, not a
   clonable session token. Enrollment requires admin approval. Re-enrollment (lost/reset/SIM-swap/
   reinstalled phone) requires the other trusted party's involvement - a compromised admin account
   alone must not be able to re-bind a user's identity to a new device.
4. **App requires biometric/PIN unlock** in addition to OS lock screen. "App is on the phone" is
   never treated as equivalent to "the enrolled person is present."
5. **BLE must be encrypted and mutually authenticated.** No plaintext GATT characteristics carry
   commands, tokens, or OTPs in any build that isn't explicitly marked as a bench/test build.
   Distance/proximity claims must never rely on RSSI alone for production authorization - RSSI is
   a weak secondary signal only. The current MVP removes RFID/NFC and uses BLE as the local
   transport/presence signal, which is not relay-attack-resistant by itself. Any production claim
   of physical proximity requires an explicit reviewed mechanism such as BLE Channel Sounding,
   UWB distance-bounding, or a reintroduced tap factor; see `HARDWARE_REFERENCE.md`.
6. **Dual/simultaneous presence must be actively re-verified**, not assumed from an earlier event.
   Before actuating, the backend re-checks that the first party is still actively connected, not
   just that they connected at some point earlier in the flow.
7. **No relay-attack-naive proximity logic.** Any proximity check must be explicitly evaluated
   against the relay-attack scenario (attacker forwards radio signal between a distant phone and
   the lock) before being trusted as a security boundary, not just a UX nicety.
8. **Fail closed, always.** Backend unreachable, admin unavailable, low battery, BLE/auth failure,
   ambiguous FSM state - all of these result in the locker staying locked, never an auto-open
   fallback. The only bypass path is the two-key physical emergency mechanism, which is itself
   logged and alerted.
9. **No OTA firmware updates until a signed-update mechanism with rollback protection exists.**
   Do not implement any firmware update path that lacks signature verification, even for internal
   testing convenience.
10. **Never disable TLS/certificate verification**, even "temporarily for testing" - use a
    documented local dev backend with its own valid cert chain instead.

## Secrets and credentials

- No API keys, signing keys, backend URLs with embedded credentials, or real customer data in
  source, commit history, comments, or example/test files.
- Test/dev credentials must be obviously fake (e.g. clearly named placeholder values) and never
  reused as real defaults.
- Any cryptographic key generation, storage, or handling code must state which key lives where
  (phone secure enclave, lock hardware, backend HSM/KMS) and must not be written by inferring
  "reasonable-sounding" crypto without this being explicitly reviewed.

## Logging discipline

- Never log OTPs, tokens, private keys, or biometric data in plaintext, in any log destination,
  including local device logs and serial/debug output. This applies to test builds too - habits
  from test builds leak into production builds.
- Do log: timestamps, requester/approver identities, admin identity and reason notes, connection
  events, BLE presence/proximity metadata used, token issuance/verification events (metadata only,
  not the raw token secret if it's sensitive), and lockout/alert events.
- See `COMPLIANCE_NOTES.md` for retention and tamper-evidence requirements.

## Placeholder / simulated security convention

Any security-relevant code that is intentionally fake, simulated, or incomplete (e.g. hardcoded
test OTP, no real token verification yet, temporary BLE UUIDs) must be marked with a comment in
this exact form so it's greppable:

```
// SECURITY-PLACEHOLDER: <what's fake> - must be replaced before production. See TODO_SECURITY_DEBT.md
```

Every such marker must have a corresponding entry in `TODO_SECURITY_DEBT.md`. An agent must never
remove a `SECURITY-PLACEHOLDER` marker and its real-security replacement without that being the
explicit, stated goal of the current task.

### Explicit temporary password-demo mode

The user explicitly authorized a password-only sign-in option on 2026-10-09 for testing. It is
implemented only when `AUTH_MODE=password_demo` is deliberately configured; the default remains
OIDC. This mode omits mandatory MFA and is therefore not production authentication. Use only
synthetic test accounts/data, never expose real customer or production lock access through it, and
switch back to `AUTH_MODE=oidc` before any pilot or production deployment. The mode is deliberately
marked in the UI and tracked as open security debt. Tenant membership, role checks, device status,
and short token/session lifetimes remain enforced.

## When to stop and ask instead of proceeding

- Any change to how actuation is authorized.
- Any change to what proves "physical presence."
- Any change to OTP generation, delivery, validity, or retry rules.
- Any change to how phone/user identity is bound or re-enrolled.
- Any request to relax, skip, or "simplify for now" anything in this file.
- Anything involving real customer PII or production credentials.
