# Git Workflow

## Commit messages

- Format: `<area>: <short description>` — e.g. `firmware/ble: add NimBLE advertising service`,
  `docs/security: add OTP retry lockout rule`.
- Areas: `firmware`, `app`, `backend`, `docs`, `hardware` (for wiring/BOM notes tracked in-repo),
  `ci`/`build`.
- Body (when needed): explain *why*, not just what — especially for anything touching security
  logic, since this becomes part of the audit trail for a security product.
- Reference the relevant doc when a commit implements or resolves something tracked there, e.g.
  `Resolves SD-003 in TODO_SECURITY_DEBT.md`.

## Branching

- `main` — always buildable, always reflects the current real state including known placeholders
  (tracked in `TODO_SECURITY_DEBT.md`), never silently broken.
- Feature/task branches off `main`, named `<area>/<short-description>`, e.g.
  `firmware/ble-dual-connection`.
- No direct commits to `main` for anything touching code under `SECURITY_RULES.md` scope — those
  go through a branch + review, even in solo-dev/agent-assisted workflows, so there's a discrete
  reviewable diff.

## What requires manual (human) review before merge

- Anything touching authentication, token verification, OTP logic, key handling, or BLE
  authentication/encryption.
- Any change to `SECURITY_RULES.md`, `BLE_PROTOCOL.md`, or `DATA_MODEL.md` itself.
- Any removal of a `SECURITY-PLACEHOLDER` marker.
- Any dependency addition.

Lower-risk changes (LED patterns, logging verbosity, comments, non-security refactors) can move
faster, but should still get at least a self-review pass before merge.

## Agent-generated commits

When Claude Code or Codex generates commits, the commit message must still follow the format
above and must not claim a security item is resolved unless the corresponding
`TODO_SECURITY_DEBT.md` row is updated in the same change.
