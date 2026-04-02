# Migration and Rollback Procedures

Date: 2026-04-02

## Current State

This document now describes the steady-state release safety rules for the current PostgreSQL migration surface.

## Scope

This procedure covers schema migrations, configuration changes, backend deploys, dashboard deploys, and player-compatible data changes.

## Pre-Deploy Checks

- Confirm the change is backwards compatible or feature-flagged.
- Confirm the rollback path is documented in the release PR.
- Confirm staging smoke passed.
- Confirm database backup or restore point exists when schema changes are included.

## Migration Rules

- Prefer additive schema changes first.
- Avoid destructive changes in the same release as consumer code.
- Keep migrations idempotent.
- Run migrations before enabling code paths that depend on them.

## Rollback Rules

- If deployment breaks login, pairing, sync, or command flow, revert immediately.
- If schema changes are not backward compatible, rollback must include data recovery notes.
- Disable the feature flag or staged rollout first when the issue is limited to a new path.
- Keep the previous stable release available until post-release monitoring is complete.

## Rollback Triggers

- Error rate crosses the release threshold.
- Pairing or command acknowledgements stop arriving.
- Sync latency p95 breaches the alert threshold.
- Offline devices spike unexpectedly after deployment.
- Release gate evaluation returns `block` or `hold`.
- Rollback policy tuning returns elevated risk or insufficient SLO budget.
- Anomaly remediation dry-run reports tenant baseline divergence above the safe threshold.

## Post-Rollback Actions

1. Confirm service recovery.
2. Record the root cause and blast radius.
3. Update the release notes with the incident summary.
4. Add or adjust regression coverage.
5. Keep the release frozen until compliance evidence and anomaly remediation gates are green.