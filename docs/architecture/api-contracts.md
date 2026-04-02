# API Contracts

Date: 2026-04-01

## Ops & Migration Diagnostics

### GET /api/v1/ops/metrics

- Auth: user JWT with ops role
- Response: `{ tenant_id, devices, commands, telemetry_last_hour, top_failing_devices_last_24h }`

### GET /api/v1/ops/alerts/evaluate?window_minutes=15

- Auth: user JWT with ops role
- Response: `{ tenant_id, windows, alerts[] }`

### GET /api/v1/ops/content/parity

- Auth: user JWT with ops role
- Response: `{ parity_ok, counts, sample_diagnostics }`

### GET /api/v1/ops/rollout/guardrails/evaluate

- Auth: user JWT with ops role
- Response: `{ decision, parity, alerts, promotion_criteria }`

### GET /api/v1/ops/slo/evaluate

- Auth: user JWT with ops role
- Response: `{ escalation, slos, command_metrics, sync_metrics, error_metrics, health_metrics }`

### GET /api/v1/ops/release-gate/evaluate

- Auth: user JWT with ops role
- Response: `{ decision, block_reasons, hold_reasons, guardrails, slos }`

### GET /api/v1/ops/promotion/eligible

- Auth: user JWT with ops role
- Response: `{ promotion, parity }`

### GET /api/v1/ops/pilot/checkpoints/evaluate

- Auth: user JWT with ops role
- Response: `{ decision, rollout_progress, canary, metrics }`

### GET /api/v1/ops/failover/evaluate

- Auth: user JWT with ops role
- Response: `{ decision, regions, health, thresholds, metrics }`

### GET /api/v1/ops/canary/deployment/evaluate

- Auth: user JWT with ops role
- Response: `{ decision, deployment, rollback, thresholds, metrics }`

### GET /api/v1/ops/incident/recovery/evaluate

- Auth: user JWT with ops role
- Response: `{ incident, automation, thresholds, metrics }`

### GET /api/v1/ops/chaos/resilience/certify

- Auth: user JWT with ops role
- Response: `{ certification, objectives, checks, metrics }`

### GET /api/v1/ops/simulation/gameday/evaluate

- Auth: user JWT with ops role
- Response: `{ readiness, runbook, checks, metrics }`

### GET /api/v1/ops/compliance/evidence/evaluate

- Auth: user JWT with ops role
- Response: `{ compliance, controls, evidence }`

### GET /api/v1/ops/rollback/policy/tune

- Auth: user JWT with ops role
- Response: `{ policy, risk, slo_budget, metrics }`

### GET /api/v1/ops/anomaly/remediation/evaluate

- Auth: user JWT with ops role
- Query: `execute=true|false`
- Response: `{ anomaly_summary, orchestration, baselines, anomalies, metrics }`

## Auth

### POST /api/v1/auth/login

- Request: `{ email, password }`
- Response: `{ access_token, refresh_token, user }`

## Pairing

### POST /api/v1/pairing/request-code

- Auth: device token or bootstrap key
- Request: `{ hardware_id }`
- Response: `{ pairing_code, expires_at, device_id }`

### POST /api/v1/pairing/confirm

- Auth: user JWT
- Request: `{ pairing_code }`
- Response: `{ device_id, linked: true }`

## Playlists

### GET /api/v1/playlists

- Auth: user JWT
- Response: `{ items: Playlist[] }`

### POST /api/v1/playlists

- Auth: user JWT
- Request: `{ name, items }`
- Response: `{ playlist }`

### POST /api/v1/playlists/:id/publish

- Auth: user JWT
- Response: `{ playlist_id, version, published_at }`

## Commands

### POST /api/v1/devices/:deviceId/commands

- Auth: user JWT with device control permission
- Request: `{ type, payload, command_id }`
- Response: `{ command_id, status }`

### GET /api/v1/devices/:deviceId/commands/:commandId

- Auth: user JWT
- Response: `{ command }`

## Logs

### POST /api/v1/devices/:deviceId/telemetry

- Auth: device token
- Request: `{ kind, correlation_id, payload }`
- Response: `{ accepted: true }`
