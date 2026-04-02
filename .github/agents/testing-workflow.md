# Agent Testing Workflow

Agents must use the test plans under `tests/plans/` and store execution outputs under `tests/reports/YYYY-MM-DD/`.

## Required Plan Files

- `tests/plans/mandatory-phase-test-gate-policy.md`
- `tests/plans/master-test-orchestrator.md`
- `tests/plans/ui-interaction-test-flow.md`
- `tests/plans/api-db-integrity-test-flow.md`
- `tests/plans/socket-resilience-test-flow.md`

## Required Execution Rule

1. Run phase gates with `tests/scripts/run-phase-gates.ps1`.
2. Save raw logs and `summary.md` in dated report folder.
3. If any gate fails, do not move to next phase.
4. Fix, rerun, and record evidence before phase transition.
