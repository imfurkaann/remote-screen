# Alert Rules

Date: 2026-04-02

## Current Coverage

These rules reflect the live ops evaluation endpoints used by the current backend state through Phase-22.

## Critical
- offline_spike_critical: Trigger when offline devices exceed 20% of tenant fleet for 5 minutes.
- command_failure_critical: Trigger when command failed + timeout rate exceeds 15% in a 10 minute window.
- sync_latency_critical: Trigger when sync latency p95 exceeds 90 seconds for 15 minutes.
- error_telemetry_burst_critical: Trigger when error telemetry exceeds 25 events in a 15 minute window.
- heartbeat_drop_critical: Trigger when heartbeat telemetry drops by 70% versus the previous window.

## Warning
- offline_spike_warning: Trigger when offline devices exceed 10% for 10 minutes.
- command_failure_warning: Trigger when command failed + timeout rate exceeds 8% in a 15 minute window.
- sync_failure_spike_warning: Trigger when failed sync events exceed 10% in a 15 minute window.
- error_telemetry_burst_warning: Trigger when error telemetry count exceeds 10 events in a 15 minute window.
- heartbeat_drop_warning: Trigger when heartbeat telemetry volume drops by 50% compared to previous hour.
- heartbeat_drop_critical: Trigger when heartbeat telemetry volume drops by 70% compared to previous hour.
- compliance_evidence_warning: Trigger when evidence coverage drops below 100% or retention policy is below 30 days.
- rollback_risk_warning: Trigger when SLO budget burn exceeds balanced policy thresholds.
- anomaly_remediation_warning: Trigger when tenant anomaly score exceeds global baseline by 30%.

## Current Threshold Implementation
- command_timeout_or_failure_spike: warning at 8%, critical at 15% over last 15 minutes.
- sync_failure_spike: warning at 10%, critical at 20% over last 15 minutes.
- error_telemetry_burst: warning at 10 events, critical at 25 events over last 15 minutes.
- backend endpoint: GET /api/v1/ops/alerts/evaluate?window_minutes=15
- alert payload includes `windows.heartbeat_current_window` and `windows.heartbeat_previous_window`
- incident recovery gate: GET /api/v1/ops/incident/recovery/evaluate?window_minutes=30
- chaos certification gate: GET /api/v1/ops/chaos/resilience/certify?window_minutes=60
- game-day readiness gate: GET /api/v1/ops/simulation/gameday/evaluate?window_minutes=90
- compliance evidence gate: GET /api/v1/ops/compliance/evidence/evaluate?window_hours=24
- rollback policy gate: GET /api/v1/ops/rollback/policy/tune?window_minutes=120
- anomaly remediation gate: GET /api/v1/ops/anomaly/remediation/evaluate?window_minutes=120&execute=false

## Routing
- Critical alerts route to on-call channel and paging integration.
- Warning alerts route to operations Slack channel and daily report.

## Owners and Escalation
- command_timeout_or_failure_spike: owner backend on-call, escalate to operations lead, then incident commander.
- sync_failure_spike: owner Android on-call, escalate to backend on-call if API/storage symptoms appear.
- offline_spike: owner operations on-call, escalate to backend on-call if device heartbeat ingestion is impacted.
- error_telemetry_burst: owner backend on-call, escalate to Android on-call and operations lead.

## Response Targets
- MTTA target: less than 10 minutes for critical.
- MTTR target: less than 30 minutes for critical incidents.
