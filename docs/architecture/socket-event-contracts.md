# Socket Event Contracts

Date: 2026-04-01

## Namespace Strategy

- `/device`: Android player connections.
- `/dashboard`: Web dashboard operator connections.

## Device Room

- Room key: `device:<device_id>`

## Event: SYNC_CONTENT

- Direction: backend -> device
- Payload:
  - `correlation_id`
  - `playlist_id`
  - `playlist_version`
  - `reason`
  - `issued_at`
- Expected device behavior:
  - Fetch playlist delta
  - Download missing media
  - Verify checksums
  - Atomic swap activation

## Event: COMMAND_DISPATCH

- Direction: backend -> device
- Payload:
  - `correlation_id`
  - `command_id`
  - `type`
  - `payload`
  - `timeout_at`

## Event: COMMAND_ACK

- Direction: device -> backend
- Payload:
  - `correlation_id`
  - `command_id`
  - `status`: acked | completed | failed
  - `error_code` (optional)
  - `message` (optional)

## Recovery Contract

- Device reconnect must call `GET /api/v1/devices/:id/sync-state`.
- Backend returns pending commands and latest playlist version.
- Device must dedupe by `command_id` before execution.
