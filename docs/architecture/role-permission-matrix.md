# Role Permission Matrix

This matrix defines effective permissions for backend and dashboard operations.

## Roles

- `tenant_owner`: full tenant control including sensitive operations.
- `tenant_admin`: operational control for devices, content, and commands.
- `operator`: day-to-day control for playback/content/commands without ownership actions.
- `viewer`: read-only dashboard access with no mutation APIs.
- `device`: runtime identity for telemetry write and command ACK only.

## Permission Table

| Capability | tenant_owner | tenant_admin | operator | viewer | device |
| --- | --- | --- | --- | --- | --- |
| Request pairing code (bootstrap protected) | no | no | no | no | yes (bootstrap key) |
| Confirm pairing code | yes | yes | yes | no | no |
| Refresh device session | no | no | no | no | yes (bootstrap key) |
| Upload media | yes | yes | yes | no | no |
| Create/update/publish playlist | yes | yes | yes | no | no |
| Dispatch remote command | yes | yes | yes | no | no |
| Query command status | yes | yes | yes | no | no |
| Write telemetry | yes (ops tooling) | yes (ops tooling) | yes (ops tooling) | no | yes (own device only) |
| Query telemetry | yes | yes | yes | no | no |
| View ops metrics | yes | yes | yes | no | no |
| Export audit trail | yes | yes | yes | no | no |

## Enforcement Rules

1. Every protected route requires JWT auth with validated claims (`iss`, `aud`, `exp`, `nbf`).
2. Every data query must include tenant scope from JWT claims.
3. Device role can only write telemetry for `device_id == sub`.
4. Viewer role is denied on mutation endpoints.
5. Bootstrap key checks are mandatory for device bootstrap endpoints.

## Notes

- Permission changes must be reviewed with tenant isolation tests and regression gate checks.
- New API endpoints must be added to this matrix before release.
