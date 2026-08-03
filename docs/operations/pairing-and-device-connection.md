# Pairing and device connection operations

## End-to-end path

1. Android derives a stable `hardware_id` from `ANDROID_ID` and a Keystore-backed `device_proof`.
2. Android calls `POST /api/v1/pairing/device-session` with the bootstrap key.
3. An unpaired device calls `POST /api/v1/pairing/request-code`; the backend stores a five-minute pairing code in MongoDB.
4. The dashboard calls its `/api/pairing/confirm` proxy, which forwards to backend `POST /api/v1/pairing/confirm` with the user JWT.
5. Android obtains a device JWT from `device-session` and connects to Socket.IO namespace `/device`.
6. The dashboard obtains a short-lived socket ticket from `/api/socket-ticket` and connects to `/dashboard`.
7. Android sends `HEARTBEAT`; backend persists presence and broadcasts `DEVICE_STATUS` to the tenant dashboard room.
8. Playlist publish persists the assignment and emits `SYNC_CONTENT`; Android downloads media from the supplied URLs and acknowledges commands through `COMMAND_ACK`.

## Reinstall recovery

Uninstalling the Android app normally preserves `ANDROID_ID` but deletes its Keystore credential. The backend must not rotate the credential from an unauthenticated request alone. It issues a short-lived recovery code containing the pending credential hash. A user from the device's existing tenant must read and confirm that physical code. Only then is the stored credential rotated. A user from another tenant receives `DEVICE_OWNED_BY_ANOTHER_TENANT`, and the code remains usable by the owner tenant.

## Configuration invariants

- Android `BOOTSTRAP_KEY` must equal backend `DEVICE_BOOTSTRAP_KEY` byte-for-byte.
- Android `BACKEND_BASE_URL` must be reachable by the display.
- Dashboard `BACKEND_BASE_URL` is the server-to-server backend address.
- Dashboard `BACKEND_PUBLIC_SOCKET_URL` is the browser-reachable Socket.IO origin and is read at container runtime.
- Build the debug APK with `powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1`. The script reads the development Compose values, injects them as Gradle properties, verifies generated `BuildConfig`, and prints only a twelve-character key fingerprint.

## MongoDB records

- `devices.hardwareId` is unique. `deviceCredentialHash` is excluded from ordinary queries. `tenantId` and `pairedOwnerUserId` define ownership; presence is based on authenticated heartbeats, not the stale `status` field alone.
- `pairingcodes` stores `deviceId`, six-digit `code`, `expiresAt`, `consumedAt`, pending `deviceCredentialHash`, and the short-lived `claimedAt`/`claimedBy` confirmation lock.
- Partial unique indexes allow one active code per device and one active document per code value. The TTL index removes expired documents.
- `pairingaudits` records request, confirmation, failure, recovery reason, actor and tenant information.
- `playlists`, `media`, `commands`, and `telemetries` are tenant-scoped. Playlist publish updates `devices.currentPlaylistId`; command delivery and ACK state are durable.

Run the read-only integrity audit after deployment:

```bash
sudo docker-compose exec backend node dist/scripts/check-database-integrity.js
```

## Deployment verification

```bash
cd /home/ubuntu/remote-screen
sudo docker-compose up -d --build --force-recreate backend dashboard
sudo docker-compose ps
sudo docker-compose logs --tail=150 backend dashboard
```

Install the newly generated root `app-debug.apk`. On first start or reinstall recovery, a six-digit code must appear. Confirm it from the same tenant. The screen should then become online after its authenticated socket heartbeat.

A bootstrap mismatch is displayed on Android as local/server fingerprints. A newly deployed backend also returns `X-Device-Bootstrap-Fingerprint` on pairing bootstrap responses, so the values can be compared without exposing the secret.