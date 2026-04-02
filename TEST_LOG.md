# Integration Test Log - 2026-04-02

## Test Environment Setup

- MongoDB: `localhost:27017`
- Backend: `http://localhost:4100`
- Dashboard: `http://localhost:3001`
- Emulator: `emulator-5554`

## Execution Snapshot (Latest)

- Backend test suite: PASS (`53/53`)
- Governance exception CLI tests: PASS (`2/2`)
- Dashboard browser E2E: PASS
- Android runtime smoke: PASS (ACK + reconnect)
- Publish-sync dispatch: PASS (`SYNC_CONTENT` observed)

## Key Validations

### 1. Pairing and Runtime Session

- [x] Request-code + confirm flow working
- [x] Runtime launch with `device_id`/`socket_base_url` extras
- [x] Device command ACK transitions to `completed`

### 2. Content Publish & Sync

- [x] Media upload and playlist create/publish working
- [x] `SYNC_CONTENT` received on Android socket client
- [x] Active content directory swap succeeds in app sandbox

### 3. Stability Fixes Applied Today

- [x] Fixed command state shadow sync consistency in backend command service
- [x] Fixed Android wrong-thread ExoPlayer access on startup/playback restore
- [x] Fixed Android large-image preview crash by downsampling bitmap in Compose UI

## Known Remaining Work (Next Session Start Here)

1. Re-run manual publish with a newly uploaded large image on the exact selected emulator device and visually confirm screen swap.
2. Keep crash buffer check (`adb logcat -b crash -d`) as post-publish guard.
3. Continue from roadmap runtime stabilization track after visual confirmation.
