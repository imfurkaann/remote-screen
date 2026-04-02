# E2E Critical Flow Test Flow

## Scope

End-to-end user-visible flows:

1. Pairing
2. Content upload and playlist publish
3. Remote command dispatch

## Preconditions

1. Backend running.
2. MongoDB reachable.
3. At least one device exists from pairing flow.

## Steps

1. Create tenant admin token.
2. Request and confirm pairing code.
3. Upload media and create playlist.
4. Publish playlist to target device.
5. Dispatch command to same device.

## Pass Criteria

1. Pairing returns linked=true.
2. Media upload returns media id.
3. Playlist create and publish return success.
4. Command dispatch returns command object.

## Evidence

- `tests/reports/YYYY-MM-DD/e2e-critical-smoke.md`
