# UI Interaction Test Flow

## Scope

Dashboard user-facing buttons and form interactions.

## Mandatory Flows

1. Login submit:
   - valid credentials -> success
   - invalid credentials -> visible error
2. Pair device button:
   - valid 6-digit code -> success
   - invalid code -> error
3. Playlist actions:
   - create playlist
   - attach media
   - publish playlist
4. Remote command actions:
   - reboot
   - set volume
   - force refresh
   - screenshot
5. Logout:
   - auth cookie removed
   - protected routes blocked

## Validation

1. Correct UI state and message.
2. Correct API status code.
3. Correct DB updates for each action.
4. Error feedback exists for failure paths.

## Evidence To Save

- Request and response snippets.
- DB query snapshots.
- UI screenshots for pass and fail cases.
- Report markdown under `tests/reports/YYYY-MM-DD/`.
