# Phase 17 Error Logging Checklist

Date: 2026-04-02
Owner: Backend, Android, Dashboard, Operations
Status: Completed (PASS)

## A. Error Envelope Standard
- [x] All API failures return the same envelope schema.
- [x] `correlation_id` is present on every 4xx/5xx response.
- [x] `code` is normalized to `UPPER_SNAKE_CASE`.
- [x] Not-found routes use the same error envelope.
- [x] Error responses avoid leaking secrets or internal credentials.

## B. Backend Global Error Handling
- [x] Global error middleware is active and catches unhandled route errors.
- [x] Uncaught exceptions are logged in structured JSON format.
- [x] Unhandled promise rejections are logged in structured JSON format.
- [x] Logs include route, method, status, tenant, actor, and correlation_id.
- [x] Error stack traces are captured for server-side diagnostics.

## C. Device-Side Error Telemetry
- [x] Sync download failures emit telemetry error events.
- [x] Checksum mismatches emit telemetry error events.
- [x] Playback failures emit telemetry error events.
- [x] Command failures/timeouts emit telemetry error events.
- [x] Telemetry payload includes identifiers (`device_id`, `command_id`, `playlist_id`) when available.

## D. Dashboard Troubleshooting Surface
- [x] Device troubleshooting view shows latest command timeline.
- [x] Troubleshooting view shows latest sync and playback failures.
- [x] Troubleshooting view shows heartbeat and last seen state.
- [x] Filtering by `correlation_id` is available.
- [x] Tenant isolation is enforced on all troubleshooting endpoints.

## E. Support Bundle Export
- [x] Support bundle export endpoint is available (JSON/CSV).
- [x] Export contains command timeline, telemetry errors, and pairing audit trail.
- [x] Export contains correlation_id list for issue traceability.
- [x] Export access is RBAC-protected.
- [x] Export format is documented for support operations.

## F. Alerting and Operations
- [x] Alert rule for command timeout spikes is configured.
- [x] Alert rule for sync failure spikes is configured.
- [x] Alert rule for offline device anomalies is configured.
- [x] Alert rule for telemetry error bursts is configured.
- [x] On-call owner and escalation path are defined for each alert.

## G. Validation and Drill
- [x] Controlled command failure drill is executed.
- [x] Controlled sync failure drill is executed.
- [x] Correlation_id-based end-to-end trace succeeds.
- [x] Support runbook is used to resolve a mock customer issue.
- [x] RCA and regression test are recorded after the drill.

## H. Exit Criteria
- [x] Error envelope compliance verified across critical APIs.
- [x] Global error handling verified under expected failure modes.
- [x] Device error telemetry ingestion verified.
- [x] Support drill completed with reproducible triage flow.
- [x] Phase decision recorded: PASS / CONDITIONAL-PASS / FAIL.

## Validation Evidence
- Backend and dashboard typecheck passed after the final troubleshooting and support-bundle changes.
- Support drill report recorded at [tests/reports/2026-04-02/support-drill.md](tests/reports/2026-04-02/support-drill.md).
- Backend observability and process logging validated in [backend/src/middlewares/observability.ts](backend/src/middlewares/observability.ts) and [backend/src/index.ts](backend/src/index.ts).
