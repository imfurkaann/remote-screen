# Socket Resilience Smoke Report

- Date: 2026-06-01
- Base URL: http://localhost:4100/api/v1

## Setup
- PASS
- device_id: 69cd6c357095340d1d956e74
- tenant: tenant-demo

## Timeout and Retry Lifecycle
- PASS
- initial_status: timeout
- final_status: timeout
- attempts: 2
- max_attempts: 2

## Duplicate command_id Dedupe
- PASS
- first_command_id: cmd-socket-smoke-dedupe-001
- second_command_id: cmd-socket-smoke-dedupe-001
- second_status: timeout

## Online ACK Path
- PENDING-EVIDENCE
- Requires connected Android socket client to emit ACK/COMPLETED.
- Not executable in backend-only smoke environment.

## Reconnect and Missed Event Recovery
- PENDING-EVIDENCE
- Requires controlled socket disconnect/reconnect from player runtime.
- Validate with device/emulator run during Android smoke pack.

## Gate Decision
- CONDITIONAL-PASS
- Backend-side resilience checks passed; runtime socket evidence pending.
