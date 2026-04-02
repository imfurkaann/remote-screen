# Incident Runbook

Date: 2026-04-02

## Current Coverage

This runbook matches the live recovery and diagnostics endpoints currently implemented in the backend.

## Severity Guide

- Sev-1: widespread outage, command delivery failure, or fleet-wide sync failure.
- Sev-2: partial outage, tenant-specific failure, or repeated reconnect instability.
- Sev-3: isolated issue with workaround.

## Initial Triage

1. Identify the affected layer: backend, dashboard, Android player, or storage.
2. Capture correlation IDs, tenant ID, device ID, and release version.
3. Check dashboards, alerts, and recent deploys.
4. Determine whether the issue is active, degraded, or already recovering.

## Standard Response Order

1. Contain the impact with feature flag, rollout pause, or rollback.
2. Restore the most important user path first: login, pairing, sync, or command dispatch.
3. Confirm telemetry recovery and watch for regressions.
4. Document the root cause and follow-up actions.

## Automation Entry Points

1. Use `GET /api/v1/ops/incident/recovery/evaluate` to classify severity and select the recovery workflow.
2. Use `GET /api/v1/ops/chaos/resilience/certify` to verify whether the system is eligible for a resilience gate promotion.
3. Use `GET /api/v1/ops/simulation/gameday/evaluate` to confirm drill readiness and runbook SLA timing.
4. Use `GET /api/v1/ops/compliance/evidence/evaluate` to confirm evidence coverage before release promotion.
5. Use `GET /api/v1/ops/rollback/policy/tune` when rollback thresholds need recalibration against live SLO burn.
6. Use `GET /api/v1/ops/anomaly/remediation/evaluate?execute=false` for dry-run anomaly analysis before automated remediation.

## Support Bundle Workflow

1. Identify target device with `device_id` or `hardware_id` from ticket.
2. Export troubleshooting bundle from dashboard Operations page or backend endpoint:
	- `GET /api/v1/ops/support-bundle?device_id=...`
	- `GET /api/v1/ops/support-bundle?hardware_id=...`
3. Choose `format=json` for machine-readable triage or `format=csv` for spreadsheet review.
4. Capture correlation IDs from `correlation_ids` and `last_error_payloads`.
5. Cross-check command timeline against command dispatch logs and ACK status.
6. Attach bundle JSON or CSV to incident record and reference final RCA.

## Common Incidents

- Login failures: verify JWT config, cookie settings, and auth proxy behavior.
- Pairing failures: verify pairing code flow and tenant ownership checks.
- Command failures: verify socket connectivity, command status transitions, and ACK handling.
- Sync failures: verify checksum, storage availability, and activation swap.
- Storage issues: verify S3 lifecycle, bucket permissions, and free space.
- Rollback risk spikes: verify SLO burn rate, anomaly score, and canary thresholds before re-enabling rollout.
- Compliance evidence gaps: verify audit coverage, telemetry coverage, and retention policy before promotion.

## Communications

- Use a single incident owner.
- Post the current status and next update time.
- Escalate immediately if a critical threshold is crossed.

## Postmortem Inputs

- Timeline
- Root cause
- Customer impact
- Rollback or mitigation taken
- Regression actions
- Whether remediation was dry-run or executed
- Which automation gate blocked promotion, if any