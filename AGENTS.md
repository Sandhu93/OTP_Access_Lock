# AGENTS.md

Read this file first, every session, before writing or modifying any code.

## What this project is

A commercial, split-trust electronic locker/safe system for enterprise use (initial target
vertical: banking). No single person can open a locker alone. Each locker enforces an N-of-M
approval policy (default 2-of-3): a requester and at least one other enrolled, physically present
person must both authenticate via a BLE-connected mobile app, with an IT admin reviewing and
approving the request via a backend dashboard before an OTP is issued. RFID/NFC is deferred and
is not part of the current MVP hardware path. Locks are ESP32-S3-based hardware with WiFi + BLE,
each independently networked to the backend.

Full detail lives in `docs/`. This file only routes you there and states the rules that override
everything else.

## Non-negotiable rules (apply regardless of what any single prompt asks for)

1. **Signed backend tokens are the only actuation trust anchor.** A lock must never actuate based
   on BLE connection state, RSSI, or "the app said so" alone. See `docs/SECURITY_RULES.md`.
2. **Never commit secrets, keys, or real credentials** to this repo, in any file, in any commit,
   even temporarily. See `docs/SECURITY_RULES.md`.
3. **Never silently replace a placeholder/simulated security mechanism with something that looks
   real but isn't**, and never remove a `SECURITY-PLACEHOLDER` marker without explicit human
   sign-off. See `docs/TODO_SECURITY_DEBT.md`.
4. **When a request is ambiguous on anything security- or trust-model-relevant, stop and ask
   rather than guessing.** This is a security product; a wrong guess here is worse than a delay.
5. **Don't change module boundaries, GATT protocol definitions, or the data model** without
   updating the corresponding doc in the same change. Code and docs must not drift apart.

## Where to go next

| Doc | Read this when you're... |
|---|---|
| `docs/PRODUCT_CONTEXT.md` | working on anything - actors, trust model, transaction flow, glossary |
| `docs/SECURITY_RULES.md` | writing or touching any auth, crypto, token, OTP, or BLE code |
| `docs/ARCHITECTURE_RULES.md` | adding a module, deciding where logic should live |
| `docs/CODING_STANDARDS.md` | writing firmware, app, or backend code |
| `docs/HARDWARE_REFERENCE.md` | touching pin maps, chip specs, wiring |
| `docs/BLE_PROTOCOL.md` | defining or consuming GATT services/characteristics/commands |
| `docs/DATA_MODEL.md` | working on backend/dashboard entities and relationships |
| `docs/TESTING_RULES.md` | deciding what "done" means for a phase or PR |
| `docs/TODO_SECURITY_DEBT.md` | before every release; tracks every known fake/placeholder security item |
| `docs/GIT_WORKFLOW.md` | committing, branching, opening a PR |
| `docs/COMPLIANCE_NOTES.md` | touching logging, audit trails, retention, or anything banking-regulation-adjacent |

## Current project phase

Hardware MVP stage: ESP32-S3 firmware with LED-as-lock-actuator and a two-party BLE state
machine using simulated OTP and no real backend yet. BLE is the local transport/presence signal
for the MVP, but signed backend tokens remain the only actuation trust anchor. See
`docs/TODO_SECURITY_DEBT.md` for the exact list of what's still fake and must not be mistaken for
production-ready.
