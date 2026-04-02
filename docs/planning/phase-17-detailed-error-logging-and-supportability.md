# Phase 17 - Detailed Error Logging and Supportability

Date: 2026-04-02
Owner: Backend, Android, Dashboard, Operations
Status: Completed (PASS)

## 1. Purpose

This phase defines a production-grade troubleshooting foundation so customer-reported issues can be diagnosed and resolved quickly.

## 2. Scope

- Backend error standardization and structured logging.
- Device-side error telemetry and diagnostic context.
- Dashboard troubleshooting visibility for support workflows.
- Support bundle export and issue triage runbook.
- Alerting thresholds for recurring failure patterns.

## 3. Non-Goals

- Pricing, packaging, or sales collateral updates.
- New media playback features unrelated to observability.
- Full SIEM platform rollout beyond agreed logging scope.

## 4. Target Outcomes

- Every customer-facing error can be traced with correlation_id.
- Support team can answer "what happened" within minutes.
- Repeated failures trigger alerts before large customer impact.
- Incident closure includes RCA and preventive test coverage.

## 5. Workstreams

### 5.1 Backend Error Model and Logging

- Enforce a single error envelope for all API failures.
- Add a global error middleware for unhandled exceptions.
- Ensure correlation_id is returned and logged consistently.
- Log key context: tenant_id, device_id, route, status_code, error_code.

### 5.2 Device Error Telemetry

- Emit telemetry kind=error for sync/download/checksum/playback failures.
- Include command_id and playlist_id when relevant.
- Include retry count and final status.
- Preserve lightweight payload shape for safe ingestion.

### 5.3 Dashboard Troubleshooting View

- Tenant-scoped troubleshooting panel with:
  - Last command timeline and terminal statuses
  - Last sync event and checksum result
  - Last heartbeat and last seen
  - Recent error telemetry list
- Quick filter by device_id and correlation_id.

### 5.4 Support Bundle and Runbook

- Exportable bundle fields:
  - tenant_id
  - device_id / hardware_id
  - correlation_id set
  - command timeline
  - sync summary
  - last error payloads
- Runbook for triage flow:
  1. Reproduce or identify ticket timestamp.
  2. Locate correlation_id.
  3. Gather support bundle.
  4. Decide workaround, hotfix, or backlog fix.
  5. Add RCA and regression test.

### 5.5 Alerting

- Command timeout spike threshold.
- Sync failure spike threshold.
- Offline screen anomaly threshold.
- Error telemetry burst threshold.

## 6. Deliverables

- Backend global error middleware implementation.
- Error envelope conformance checklist and examples.
- Android error telemetry emission points documented.
- Dashboard troubleshooting page and API wiring.
- Support bundle schema and export endpoint.
- Operational runbook for support escalation.
- Alert rule definitions with owners.

## 7. Acceptance Criteria

- 100% of backend error responses include correlation_id.
- Unhandled backend exceptions are captured by global middleware.
- Device sync/playback/command failures generate telemetry error entries.
- Support can retrieve a device troubleshooting bundle in under 3 minutes.
- At least one drill ticket is triaged end-to-end using correlation_id.
- RCA is produced and linked to a regression test for the drill issue.

## 8. Validation Plan

1. Inject a controlled command failure and verify end-to-end traceability.
2. Inject a controlled sync checksum failure and verify telemetry capture.
3. Run support drill with a mock customer incident.
4. Confirm alert triggers when threshold conditions are met.

## 9. Risks

- Over-logging noisy events may increase storage cost.
- Missing tenant scoping in tools can cause data leakage risk.
- High-volume telemetry may impact query performance.

## 10. Dependencies

- Stable tenant/auth context propagation.
- Backend telemetry ingestion capacity.
- Dashboard API proxy coverage for troubleshooting endpoints.
- Operations owner for alert tuning and on-call response.

## 11. Exit Decision

- PASS: acceptance criteria and validation plan all complete.
- CONDITIONAL-PASS: minor UX/reporting gaps with no traceability risk.
- FAIL: correlation_id traceability or support drill cannot be completed.

## 12. Validation Evidence (2026-04-02)

- Android telemetry error hooks integrated for sync, playback, and command failure paths and Kotlin compile passed.
- Backend endpoints verified: `/ops/devices/:id/troubleshoot`, `/ops/support-bundle`, `/ops/alerts/evaluate`.
- Support drill executed via `tests/scripts/run-support-drill.ps1`.
- Output report: `tests/reports/2026-04-02/support-drill.md` with gate decision `PASS`.
