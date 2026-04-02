# Environment Variables and Secrets Standard

Date: 2026-04-01

## Environment Files

- `.env.example` must exist for every runnable service.
- Real secrets must never be committed.
- Local developer secrets are stored only in untracked `.env.local` files.

## Required Secret Classes

- JWT signing keys
- MongoDB connection strings
- AWS credentials and bucket identifiers
- Socket auth secrets

## Naming Convention

- Use upper snake case, service-prefixed when needed.
- Examples:
  - `BACKEND_PORT`
  - `MONGO_URI`
  - `JWT_ACCESS_SECRET`
  - `AWS_S3_BUCKET`

## Validation Rules

- Service startup must validate required env vars.
- Missing critical vars should fail fast.

## Rotation Rules

- Production secrets rotate at least every 90 days.
- Compromised secret rotation is immediate.
- Rotations must be tracked in change log.

## Access Control

- Least privilege principle for all credentials.
- Different credentials per environment (dev, staging, prod).

## Logging Rules

- Never log full secrets.
- Mask sensitive values in logs and error reports.
