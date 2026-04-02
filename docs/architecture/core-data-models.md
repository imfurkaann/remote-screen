# Core Data Models

Date: 2026-04-02

## Current State

This document reflects the active backend model surface used by the current system through the Phase-22 database migration state.

## Device

- `id`: string
- `tenant_id`: string
- `hardware_id`: string
- `status`: online | offline | degraded
- `app_version`: string
- `os_version`: string | null
- `device_model`: string | null
- `last_heartbeat_at`: datetime
- `last_seen_at`: datetime | null
- `paired_owner_user_id`: string | null
- `current_playlist_id`: string | null
- `location`: string | null
- `metadata`: object

## Media

- `id`: string
- `tenant_id`: string
- `type`: image | video
- `filename`: string
- `storage_key`: string
- `checksum_sha256`: string
- `size_bytes`: number
- `duration_ms`: number | null
- `mime_type`: string
- `s3_url`: string | null
- `status`: ACTIVE | ARCHIVED | QUARANTINED
- `created_by`: string
- `created_at`: datetime

## Playlist

- `id`: string
- `tenant_id`: string
- `name`: string
- `items`: PlaylistItem[]
- `version`: number
- `published_at`: datetime | null
- `published_by`: string | null

## PlaylistItem

- `media_id`: string
- `order`: number
- `duration_override_ms`: number | null

## Command

- `id`: string
- `tenant_id`: string
- `device_id`: string
- `type`: REBOOT_APP | SET_VOLUME | FORCE_REFRESH | SCREENSHOT
- `payload`: object
- `command_id`: string
- `attempts`: number
- `max_attempts`: number
- `timeout_ms`: number
- `status`: pending | dispatched | acknowledged | completed | timeout | failed
- `sent_at`: datetime | null
- `ack_at`: datetime | null
- `completed_at`: datetime | null
- `timeout_at`: datetime | null
- `error_code`: string | null
- `error_message`: string | null

## Telemetry

- `id`: string
- `tenant_id`: string
- `device_id`: string
- `kind`: heartbeat | playback | sync | command
- `correlation_id`: string
- `payload`: object
- `created_at`: datetime
- `updated_at`: datetime

## PairingCode

- `id`: string
- `tenant_id`: string
- `device_id`: string | null
- `code`: string
- `status`: pending | confirmed | expired | revoked
- `expires_at`: datetime
- `created_at`: datetime

## PairingAudit

- `id`: string
- `tenant_id`: string
- `device_id`: string
- `hardware_id`: string | null
- `event_type`: string
- `actor_type`: string
- `actor_id`: string | null
- `result`: success | failed
- `reason`: string | null
- `created_at`: datetime
