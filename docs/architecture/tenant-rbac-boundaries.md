# Tenant Isolation and RBAC Boundaries

Date: 2026-04-01

## Tenant Isolation Rules

- Every row/document must carry `tenant_id`.
- Read and write access must enforce `tenant_id` match.
- Device tokens are tenant-scoped and device-scoped.
- S3 keys must be tenant-prefixed.

## RBAC Roles

- `tenant_owner`: full tenant control.
- `tenant_admin`: operational management, no billing critical actions.
- `content_editor`: create/edit playlists and media.
- `operator`: monitor screens and run limited commands.
- `viewer`: read-only access.

## Permission Baseline

- Pairing confirm: owner/admin only.
- Command dispatch: owner/admin/operator (policy-based).
- Playlist publish: owner/admin/content_editor.
- Audit export: owner/admin only.

## Enforcement Points

- API middleware: JWT + permission checks.
- Query layer: tenant_id mandatory filters.
- Socket auth: tenant and role claims validated before room join.

## Security Tests (Minimum)

- Cross-tenant read attempt is denied.
- Cross-tenant command dispatch is denied.
- Role escalation attempt is denied.
- Audit log captures denied access attempts.
