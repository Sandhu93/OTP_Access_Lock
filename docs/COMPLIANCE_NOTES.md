# Compliance Notes

Status: **early/directional.** First target vertical is banking. This doc captures compliance-
relevant decisions already made and open questions to resolve with actual regulatory/legal input
before customer pilots — it is not a substitute for that review.

## Audit logging requirements (already decided)

- Log everything relevant to an unlock transaction: request time, requester, approver, admin
  identity and reason notes, OTP issuance/entry timestamps, BLE presence/proximity metadata used, final
  actuation timestamp.
- Logs must be tamper-evident: hash-chained, write-once. See `DATA_MODEL.md` `AuditLogEntry`.
- The lock hardware keeps its own small local log independent of the cloud backend, so a disputed
  or compromised network log isn't the only record — useful if backend integrity is ever
  questioned, e.g. in an investigation.
- GPS logging is explicitly **not** default-on. If included at all, it must be an optional,
  per-tenant-configurable field — continuous location logging of employee phones raises labor/
  privacy law questions (particularly relevant in India, where this product is initially being
  built/deployed) that need real legal review before being enabled for any customer.

## Data isolation (already decided)

- Full multi-tenant isolation: customer data and lock fleets are fully isolated per tenant, not
  just filtered at the application layer. See `DATA_MODEL.md` `Tenant` scoping.

## Open questions requiring real legal/compliance input before a banking pilot

- **Data residency:** where must logs/backend data physically reside for an Indian banking
  customer? Likely relevant: RBI data localization requirements for financial data. Needs
  confirmation before choosing cloud region/hosting.
- **Retention periods:** how long must audit logs, enrollment records, and unlock transaction
  records be retained, and is there a maximum as well as a minimum (e.g. for eventual data
  deletion requirements)? Not yet determined per-entity — see the open question in
  `DATA_MODEL.md`.
- **Employee monitoring/consent:** what disclosures or consent are required before deploying an
  app on employee-owned or employer-issued phones that logs biometric-gated access events?
  Depends on employment law and internal company policy, not just this product's design.
- **Regulatory audit access:** does a banking regulator need a defined mechanism to request/export
  audit trails from this system? Not yet designed.
- **Incident/breach notification obligations:** if lock or backend compromise is suspected, what
  notification timelines/obligations apply, and does the audit log design (tamper-evident,
  hash-chained) support producing evidence quickly enough to meet them?
- **Encryption-at-rest and key management standards:** banking customers may require specific
  standards (e.g. HSM-backed key management) beyond what's assumed in `SECURITY_RULES.md` today
  — confirm against actual customer/regulatory requirements before finalizing backend crypto
  architecture.

## How this doc should be used

Treat every "already decided" item above as a floor, not a ceiling — specific banking customers
may require more. Treat every open question as a blocker for a real (non-lab) banking pilot, not
something to quietly skip. When a question above is resolved, move it to "already decided" with
the date and source of the decision (legal review, specific customer requirement, etc.).
