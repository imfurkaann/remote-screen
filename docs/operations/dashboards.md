# Operational Dashboards

Date: 2026-04-02

## Current Coverage

The dashboard set should mirror the live ops evaluation endpoints implemented in the backend today.

## Dashboard Panels
- Fleet status: online vs offline device count by tenant.
- Command reliability: completed, failed, timeout, and success rate.
- Telemetry volume: heartbeat, playback, and sync events per hour.
- Top failing devices: devices with highest command failures in last 24 hours.
- Heartbeat drop watch: current vs previous window heartbeat counts.
- Rollout guardrails: parity, alert severity, and promote/hold/block decisions.
- Incident recovery: severity, automated actions, and runbook step recommendations.
- Chaos resilience: certification status, RTO/RPO objectives, and MTTR.
- Game-day readiness: runbook evidence timing and readiness gate.
- Compliance evidence: control coverage, retention policy, and evidence completeness.
- Rollback policy: risk score, burn rates, and auto-rollback mode.
- Anomaly remediation: tenant vs global baseline deltas and remediation status.

## Data Sources
- API: GET /api/v1/ops/metrics
- API: GET /api/v1/devices/:deviceId/telemetry?kind=playback&limit=100
- API: GET /api/v1/ops/alerts/evaluate?window_minutes=15
- API: GET /api/v1/ops/rollout/guardrails/evaluate
- API: GET /api/v1/ops/incident/recovery/evaluate
- API: GET /api/v1/ops/chaos/resilience/certify
- API: GET /api/v1/ops/simulation/gameday/evaluate
- API: GET /api/v1/ops/compliance/evidence/evaluate
- API: GET /api/v1/ops/rollback/policy/tune
- API: GET /api/v1/ops/anomaly/remediation/evaluate
- Dashboard page: /operations

## Usage
- Use /operations for tenant-level health checks.
- Drill down by device using telemetry query endpoints.
- Use correlation_id from logs and telemetry to trace incidents end-to-end.
