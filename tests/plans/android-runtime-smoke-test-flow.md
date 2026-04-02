# Android Runtime Smoke Test Flow

## Scope

Validate runtime command and socket behavior with a connected Android device or emulator.

## Preconditions

1. `adb` is installed and available in PATH.
2. At least one device is connected (`adb devices`).
3. Backend is running and reachable.
4. App package is installed and started on the target device.

## Scenarios

1. Device online heartbeat observed in backend telemetry.
2. Command dispatch receives ACK/COMPLETED on connected runtime.
3. Socket reconnect behavior after network toggle.
4. Force refresh command triggers sync and completion.

## Pass Criteria

1. Command status transitions include `acknowledged` then `completed`.
2. Telemetry heartbeat is ingested for runtime device.
3. Reconnect restores command channel after interruption.
4. No crash or fatal runtime log in smoke window.

## Evidence

- `tests/reports/YYYY-MM-DD/android-runtime-smoke.md`
- Optional `adb logcat` capture for failure analysis.
