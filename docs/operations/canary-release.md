# Canary Release Process

Date: 2026-04-02

## Current Position

Canary release is now one gate in the broader release chain that also includes SLO, incident recovery, chaos, game-day, compliance, rollback policy, and anomaly remediation checks.

## Objective

Release new code to a small, representative slice of traffic before broad rollout.

## Canary Scope

- Start with a small subset of tenants or screens.
- Keep canary devices on the same command, telemetry, and sync path as production.
- Exclude high-risk customers from the first canary wave unless explicitly approved.

## Canary Steps

1. Deploy to staging first and validate the release gate.
2. Promote to canary only after smoke checks pass.
3. Monitor command success, sync latency, reconnect attempts, and offline rate.
4. Expand the rollout if metrics remain within threshold.
5. Stop or rollback on any critical threshold breach.
6. Confirm the policy gate returned by `GET /api/v1/ops/rollback/policy/tune` before increasing traffic.
7. Confirm anomaly and compliance gates are not blocking promotion.

## Required Metrics

- command_success_rate
- command_timeout_rate
- sync_latency_p95
- playback_failure_rate
- reconnect_attempts
- rollback_risk_score
- anomaly_summary.status
- compliance.status

## Stop Conditions

- Critical alerts fire for the release window.
- Command timeout rate exceeds the warning threshold and trends upward.
- Canary devices stop reporting telemetry.
- Player activation or checksum validation fails.
- Any gate returns `block` or `hold` during the current release window.

## Completion Criteria

- Canary metrics stay within threshold for the post-release watch window.
- No production rollback action is needed.
- The release is promoted to the full fleet.
- Compliance evidence is complete and anomaly remediation is not required.