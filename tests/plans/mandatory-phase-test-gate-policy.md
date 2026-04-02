# Mandatory Phase Test Gate Policy

No phase transition is allowed unless all required gates for the current phase pass.

## Rules

1. Every failed gate must create a bug entry using `.github/agents/bug-triage-template.md`.
2. Every fix must pass `.github/agents/regression-gate-checklist.md` before retest.
3. Phase status can only be one of:
   - `PASS`: all required gates are green.
   - `BLOCKED`: one or more required gates failed.
   - `WAIVED`: explicit user approval with written risk.

## Required Gates Per Phase

### Phase 0 to Phase 2

- Docs completeness review.
- Contract consistency review.

### Phase 3 to Phase 5

- `npm run lint`
- `npm run test`
- `npm run build`
- Startup smoke checks.

### Phase 6 to Phase 10

- API integration tests.
- UI interaction tests for touched screens.
- DB write verification for touched flows.
- Socket and reconnect tests when applicable.

### Phase 11 and Beyond

- Security tests.
- E2E critical flow suite.
- Regression checklist pass.

## Exit Criteria

1. All required gates pass.
2. No open P0 or P1 bugs.
3. P2 bugs are fixed or explicitly accepted with mitigation.
4. Test report is saved under `tests/reports/YYYY-MM-DD/`.
