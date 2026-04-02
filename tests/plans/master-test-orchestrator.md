# Master Test Orchestrator

## Purpose

Standardize test execution before phase transitions.

## Inputs

- Current phase.
- Changed files.
- Impacted layers (`backend`, `dashboard`, `android`).

## Execution Flow

1. Determine impacted test packs.
2. Run fast quality gates:
   - `npm run lint`
   - `npm run test`
   - `npm run build`
3. Run integration gates:
   - API flow tests.
   - DB write and read verification.
4. Run interaction gates:
   - UI button and form flows.
5. Run resilience gates for socket and sync:
   - reconnect
   - timeout and retry
   - missed event recovery
6. Save raw outputs to dated report folder.
7. If any gate fails:
   - create bug entry
   - fix
   - rerun impacted tests and regression checklist
8. Approve phase transition only when all required gates pass.

## Output

- Gate summary table.
- Failed test details.
- Bug IDs and fix status.
- Go or No-Go decision.
