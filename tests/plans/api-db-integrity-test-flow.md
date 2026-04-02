# API and DB Integrity Test Flow

## Purpose

Validate that critical APIs write correct and isolated data.

## Critical Endpoints

- `POST /api/v1/auth/login`
- `POST /api/v1/pairing/request-code`
- `POST /api/v1/pairing/confirm`
- `POST /api/v1/pairing/device-session`
- `POST /api/v1/content/media/upload`
- `POST /api/v1/content/playlists`
- `POST /api/v1/content/playlists/:playlistId/publish`
- `POST /api/v1/commands/dispatch`
- `GET /api/v1/commands/:commandId/status`
- `POST /api/v1/telemetry/heartbeat`
- `POST /api/v1/telemetry/playback`

## Per Endpoint Checks

1. Success path status code and schema.
2. Auth and RBAC enforcement.
3. Validation failures and error envelope.
4. DB write correctness and required fields.
5. Idempotency behavior where expected.

## DB Verification Checklist

1. Target collection updated.
2. Required fields present.
3. Tenant boundaries preserved.
4. Audit entries created when required.

## Evidence

- API call log.
- DB readback output.
- Summary report.
