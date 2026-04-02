# S3 Lifecycle and Storage Cost Controls

Date: 2026-04-01

## Objective

Keep media storage predictable, durable, and cost controlled without breaking playlist playback or player sync.

## Storage Rules

- Keep media uploads isolated by environment and tenant.
- Never mix staging and production buckets.
- Use least-privilege credentials for upload and read access.
- Store only the active media set and required historical artifacts.

## Lifecycle Policy

- Delete stale staging objects after validation windows expire.
- Move older non-active media to cheaper storage tiers when supported.
- Remove orphaned upload artifacts after successful publish.
- Retain audit-critical records separately from media objects.

## Cost Controls

- Set bucket-level alerts for unexpected growth.
- Review storage growth at least weekly.
- Track top tenants or playlists by storage volume.
- Block unbounded retention of temporary sync or staging files.

## Operational Checks

1. Confirm lifecycle rules are active in every environment.
2. Verify upload path still resolves for dashboard media publish.
3. Verify player sync can fetch active assets after lifecycle cleanup.
4. Review access logs for unexpected public access attempts.

## Failure Conditions

- Active media disappears before playlist activation completes.
- Staging cleanup removes files still required for rollback.
- Storage costs grow faster than fleet growth.