# Test Results and Bug Report - 2026-04-02

## Final Status

- Full backend quality gate is green from workspace root.
- Current backend test count: 53/53 passing.
- Phase-23 governance implementation is complete; current focus is Android publish-sync runtime stabilization.

## Fixed Issues

### 1. Root Dev Startup Missing Script

- Severity: Medium
- Symptom: `npm run dev` failed with `Missing script: dev`.
- Root cause: No root-level dev scripts.
- Fix:
   1. Added `dev`, `dev:backend`, `dev:dashboard` scripts in root `package.json`.
- Status: Fixed

### 2. Pairing Endpoint Blocked by Wrong Middleware Scope

- Severity: Critical
- Symptom: `POST /api/v1/pairing/request-code` returned `UNAUTHORIZED Missing bearer token`.
- Root cause: Command router was mounted at `/api/v1`, so auth middleware intercepted unrelated routes.
- Fix:
   1. Mounted command router at `/api/v1/commands` in `backend/src/app.ts`.
   2. Updated dashboard command proxy routes to the new prefix.
- Status: Fixed

### 3. Bootstrap Header Mismatch

- Severity: Medium
- Symptom: Clients using `x-device-bootstrap-key` could fail against strict `x-bootstrap-key` check.
- Root cause: Backend accepted only one header key.
- Fix:
   1. Backend now accepts both `x-device-bootstrap-key` and `x-bootstrap-key`.
- Status: Fixed

### 4. Rate-Limit Test Instability

- Severity: Medium
- Symptom: Pairing rate-limit test hit database path and failed/hung when DB state varied.
- Root cause: Test payload exercised DB write path instead of pure limiter behavior.
- Fix:
   1. Updated test to use invalid payload with valid bootstrap header, asserting limiter behavior only.
- Status: Fixed

### 5. Android Player Wrong-Thread Crash

- Severity: Critical
- Symptom: App closed during runtime/publish flows with `Player is accessed on the wrong thread`.
- Root cause: ExoPlayer operations were invoked off main thread in playback restore path.
- Fix:
   1. Moved playlist set/seek/play access to main dispatcher in `PlaybackCoordinator`.
   2. Updated snapshot capture path to run on main dispatcher.
- Status: Fixed

### 6. Android Large Image Preview Crash

- Severity: Critical
- Symptom: App closed after publish with `Canvas: trying to draw too large bitmap`.
- Root cause: Full-size bitmap preview decoded/drawn in Compose UI.
- Fix:
   1. Added downsampled decode path for preview image rendering.
   2. Kept reactive reload keys on path + file metadata for safe refresh.
- Status: Fixed

## Verification Evidence

### Quality Gate

Passed:

1. `npm run lint`
2. `npm run test`
3. `npm run build`
4. `npm run check:kotlin`

### Runtime Smoke

Passed:

1. `GET /api/v1/health` => `{ ok: true }`
2. `POST /api/v1/pairing/request-code` with `x-device-bootstrap-key` => `201` with 6-digit `code`
3. Dashboard interaction smoke (`tests/scripts/run-dashboard-smoke.ps1`) => PASS
4. Android runtime smoke (`tests/scripts/run-android-runtime-smoke.ps1`) => PASS (`final_status: completed`)
5. Dashboard browser E2E (`tests/scripts/run-dashboard-browser-e2e.ps1`) => PASS
6. Post-fix crash buffer (`adb logcat -b crash -d`) => no new player crash after reinstall and retest

Generated artifacts:

1. `tests/reports/2026-04-01/summary.md`
2. `tests/reports/2026-04-01/api-smoke.md`
3. `tests/reports/2026-04-01/dashboard-interaction-smoke.md`

## Remaining Risks (Non-Blocking)

1. Manual visual confirmation must always target the exact selected publish device when multiple paired device records exist.
2. Large media preview stability is fixed in current APK; keep one extra publish verification in next session as regression guard.

## Go/No-Go

Recommendation: GO for next session continuation.

Current note: Continue from Android publish-sync stabilization verification, then proceed with next roadmap increment.
