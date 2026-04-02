# Support Drill Report

- Date: 2026-04-02
- Base URL: http://localhost:4100/api/v1
- Objective: Reproduce issue, trace with correlation_id, and close with RCA

## Health
- PASS
- Response: {"ok":true,"service":"backend","version":"0.1.0"}

## Auth Dev Token
- PASS
- User: qa@demo.local

## Pairing and Device Session
- PASS
- bootstrap_key_used: test-bootstrap-key
- device_id: 69cdf6bebe2dd0d4e9731a98
- hardware_id: HW-SUPPORT-DRILL-001

## Reproduce Controlled Failures
- PASS
- injected_error_events: 3
- correlation_ids: drill-sync-001, drill-playback-001, drill-command-001

## Correlation Traceability
- PASS
- troubleshoot_recent_errors: 3
- support_bundle_correlation_count: 4

## Alert Threshold Check
- PASS
- sync_failure_spike severity: critical
- sync_failure_spike observed: 100 percent

## RCA
- Incident: Simulated player failures on sync/playback/command paths.
- Root Cause: Controlled injection (test scenario) created error telemetry and sync failure status to validate supportability pipeline.
- Impact: Limited to drill device; no production customer impact.
- Detection: Ops troubleshoot and alerts/evaluate endpoints identified failure pattern via correlation IDs.
- Resolution: Support bundle exported, correlations traced end-to-end, and alert thresholds confirmed active.
- Prevention: Keep drill script in regression cadence for Phase 17 exit gate.

## Gate Decision
- PASS
