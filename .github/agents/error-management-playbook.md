# Error Management Playbook

Use this playbook in every implementation, debugging, and review task.

## Core Workflow (RIFG)
1. Reproduce
- Define exact trigger conditions.
- Record expected vs actual behavior.
- Capture logs and correlation IDs.
2. Isolate
- Identify likely failing layer (backend, dashboard, android).
- Build root-cause hypotheses and rank by confidence.
- Reduce scope to minimum failing path.
3. Fix
- Apply smallest safe change first.
- Prefer backward-compatible changes.
- Add guardrails (validation, retries, timeouts, idempotency) where relevant.
4. Guard
- Add tests that fail before fix and pass after fix.
- Add observability signals (logs/metrics/alerts).
- Define rollback trigger and rollback action.

## Reliability Requirements
- All remote commands must have command_id, dedupe logic, status transitions, timeout, and ack tracking.
- All socket-driven actions must define recovery path for missed events.
- Android sync must verify checksum before activation.
- Playlist activation must be atomic (download -> verify -> swap).

## API Error Handling Standard
- Validate input and auth before business logic.
- Return stable error envelope:
  - code
  - message
  - details
  - correlation_id
- Use consistent HTTP status mapping and avoid leaking internals.

## Observability Minimum
- Structured logs in all layers.
- Correlation ID propagated across request, socket event, command, and device log.
- Required metrics:
  - command_success_rate
  - command_timeout_rate
  - sync_latency_p95
  - playback_failure_rate
  - reconnect_attempts

## Quality Gates Before Marking Done
- Repro case documented.
- Root cause documented.
- Fix implemented with least blast radius.
- Regression test added.
- Telemetry updates included.
- Rollback path documented.

## Post-Release Monitoring Window
- Monitor first 24 hours for regressions.
- Track command timeout spikes and sync delays.
- Revert or feature-flag off on threshold breach.