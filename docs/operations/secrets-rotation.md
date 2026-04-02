# Secrets Rotation Process

This process defines rotation for JWT secrets, bootstrap keys, and integration credentials.

## Scope

- `JWT_ACCESS_SECRET`
- `DEVICE_BOOTSTRAP_KEY`
- S3/service credentials (when configured)
- Dashboard runtime secrets

## Rotation Cadence

- Planned rotation: every 90 days.
- Emergency rotation: immediately after compromise suspicion.

## Planned Rotation Steps

1. Generate new secrets in secret manager.
2. Deploy backend with dual-read support window when possible.
3. Update dashboard/backend runtime environments.
4. Restart services and verify health and auth flows.
5. Invalidate old secret after verification window.
6. Record rotation in change log.

## Emergency Rotation Steps

1. Freeze risky operations (command dispatch optional by severity).
2. Rotate compromised secret immediately.
3. Reissue runtime/device sessions where needed.
4. Force re-authentication for user sessions if JWT secret changed.
5. Review audit export and logs for suspicious usage.
6. Publish incident report and follow-up actions.

## Verification Checklist

- Auth token issuance works with new secret.
- Protected endpoints accept valid tokens and reject old invalidated tokens.
- Device bootstrap flow still works with new bootstrap key.
- Smoke suite (`run-phase-gates`, API smoke, dashboard smoke) passes.

## Ownership

- Primary owner: backend lead.
- Secondary owner: operations lead.
- Approval required: tenant_owner delegate for production rotations.
