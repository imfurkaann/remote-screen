# Test Workspace

This folder contains all project test artifacts, plans, scripts, and run reports.

## Structure

- `tests/plans/`: Test workflows and gate policies.
- `tests/scripts/`: Reusable test runner scripts.
- `tests/reports/YYYY-MM-DD/`: Daily execution outputs and summaries.

## Mandatory Usage

1. Do not move to a new phase until required test gates pass.
2. For each failed gate, open a bug note and fix before re-run.
3. Keep raw command output logs and summary markdown in the same dated report folder.

## Current Active Plans

- `tests/plans/mandatory-phase-test-gate-policy.md`
- `tests/plans/master-test-orchestrator.md`
- `tests/plans/ui-interaction-test-flow.md`
- `tests/plans/api-db-integrity-test-flow.md`
- `tests/plans/socket-resilience-test-flow.md`
- `tests/plans/e2e-critical-flow-test-flow.md`
- `tests/plans/android-runtime-smoke-test-flow.md`
