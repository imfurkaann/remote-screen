# Staging Environment

Date: 2026-04-01

## Purpose

Staging must behave like production for the parts we rely on during release validation. The goal is to catch deployment, migration, auth, socket, and playback regressions before production rollout.

## Required Mirrors

- Same service topology as production for backend, dashboard, and player-facing APIs.
- Separate credentials for staging and production.
- Same MongoDB schema version and migration history.
- Same socket event contracts and auth claims.
- Same upload and media storage layout, with isolated staging buckets or prefixes.

## Required Environment Inputs

- `BACKEND_PORT`
- `DASHBOARD_PORT`
- `MONGO_URI`
- `JWT_ACCESS_SECRET`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `AWS_S3_BUCKET`
- `AWS_REGION`
- `SOCKET_AUTH_SECRET`

## Validation Before Release

1. Confirm all required env vars are present.
2. Run the phase gate and service smoke checks.
3. Verify dashboard login, pairing, playlist publish, command dispatch, and telemetry query flows.
4. Verify Android player reconnects and continues playback after restart.

## Acceptance Criteria

- Staging can exercise the same release path as production.
- Failures in staging block promotion.
- No production secrets are used in staging.