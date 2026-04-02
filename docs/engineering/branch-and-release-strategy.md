# Branch and Release Strategy

Date: 2026-04-01

## Branch Model

- `main`: production-ready code only.
- `develop`: integration branch for current sprint.
- `feature/<scope>-<short-name>`: short-lived feature branches.
- `hotfix/<issue>`: urgent production fixes.

## Pull Request Rules

- Minimum 1 reviewer approval required.
- CI must pass before merge.
- Direct push to `main` is blocked.
- Squash merge for feature branches.

## Commit Style

- Use conventional commit prefixes:
  - `feat:` new feature
  - `fix:` bug fix
  - `chore:` maintenance
  - `docs:` documentation
  - `test:` test updates

## Release Cadence

- Weekly release window for MVP.
- Emergency hotfix release allowed as needed.

## Versioning

- Semantic versioning (`MAJOR.MINOR.PATCH`).
- MVP starts at `0.x` until feature stability baseline is reached.

## Rollback Policy

- Keep last stable release deployable.
- Every release must include rollback notes in PR description.

## Related Operational Docs

- [Staging Environment](../operations/staging-environment.md)
- [Migration and Rollback](../operations/migration-and-rollback.md)
- [Canary Release](../operations/canary-release.md)
- [Incident Runbook](../operations/incident-runbook.md)
- [S3 Lifecycle and Storage Cost Controls](../operations/s3-lifecycle-and-storage-cost-controls.md)
