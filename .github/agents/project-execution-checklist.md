# Digital Signage Project Execution Checklist

Use this file as the single source of truth for project progress. Agents must work top-to-bottom unless the user explicitly approves out-of-order execution.

## How To Use
- Mark tasks as done by changing `[ ]` to `[x]`.
- Add completion date in `YYYY-MM-DD` format at end of completed line.
- Do not skip to a later task without user approval.
- If a blocked dependency exists, mark it as blocked in notes and continue with the next approved item.
- Always apply .github/agents/error-management-playbook.md when executing implementation or bug-fix tasks.
- For bug-related tasks, fill .github/agents/bug-triage-template.md and include it in the task summary.
- Before closing any task, pass .github/agents/regression-gate-checklist.md and report status.

## Phase 0 - Scope and Success Metrics
- [x] Define target customer segments (SMB, mid-market, enterprise) - 2026-04-01
- [x] Finalize MVP scope boundaries - 2026-04-01
- [x] Define post-MVP scope (Pro and Enterprise) - 2026-04-01
- [x] Set success KPIs (active screens, playback success rate, command success rate) - 2026-04-01

## Phase 1 - Repository and Dev Foundation
- [x] Create monorepo structure (backend, dashboard, android-player) - 2026-04-01
- [x] Define branch and release strategy - 2026-04-01
- [x] Define env var and secrets management standard - 2026-04-01
- [x] Set up CI baseline (lint, test, build) - 2026-04-01
- [x] Enable strict TypeScript and Kotlin quality checks - 2026-04-01

## Phase 2 - Contracts and Architecture
- [x] Define core data models (Device, Media, Playlist, Command, Telemetry) - 2026-04-01
- [x] Define API contracts (auth, pairing, playlist, command, logs) - 2026-04-01
- [x] Define Socket event contracts (SYNC_CONTENT, COMMAND_DISPATCH, ACK) - 2026-04-01
- [x] Define standard error codes and response envelope - 2026-04-01
- [x] Define tenant isolation and RBAC boundaries - 2026-04-01

## Phase 3 - Backend Core
- [x] Set up Express + TypeScript strict backend foundation - 2026-04-01
- [x] Implement Mongo connection and model layer - 2026-04-01
- [x] Implement JWT auth and RBAC middleware - 2026-04-01
- [x] Implement pairing code generate/verify endpoints - 2026-04-01
- [x] Implement Socket namespace and room strategy - 2026-04-01
- [x] Add rate limit and anti-bruteforce protection - 2026-04-01

## Phase 4 - Dashboard Core
- [x] Set up Next.js app router foundation - 2026-04-01
- [x] Implement auth flow and protected routes - 2026-04-01
- [x] Build pairing screen - 2026-04-01
- [x] Build screen list and status view - 2026-04-01
- [x] Build playlist CRUD baseline - 2026-04-01
- [x] Build remote command panel baseline - 2026-04-01

## Phase 5 - Android Core
- [x] Implement boot and startup lifecycle flow - 2026-04-01
- [x] Implement hardware_id generation and persistence - 2026-04-01
- [x] Implement Retrofit API client - 2026-04-01
- [x] Implement Socket client with exponential backoff and jitter - 2026-04-01
- [x] Implement Room schema and repositories - 2026-04-01
- [x] Implement lifecycle-safe ExoPlayer controller - 2026-04-01

## Phase 6 - Pairing and Identity E2E
- [x] Android requests pairing code successfully - 2026-04-01
- [x] Dashboard pairs device via 6-digit code - 2026-04-01
- [x] Backend links device to owner account correctly - 2026-04-01
- [x] Device token/session refresh after pairing - 2026-04-01
- [x] Pairing audit log entries are created - 2026-04-01
- [x] Pairing misuse protections are verified - 2026-04-01

## Phase 7 - Content and Sync E2E
- [x] Media upload flow works end-to-end - 2026-04-01
- [x] Playlist model and mapping are complete - 2026-04-01
- [x] Playlist updates emit SYNC_CONTENT event - 2026-04-01
- [x] Android downloads and stores content locally - 2026-04-01
- [x] Checksum verification is enforced before activation - 2026-04-01
- [x] Atomic swap activation is implemented - 2026-04-01

## Phase 8 - Playback and Offline Reliability
- [x] Playback reads only from local cache - 2026-04-01
- [x] Corrupt-file fallback and repair flow is implemented - 2026-04-01
- [x] Cache quota and eviction policy are implemented - 2026-04-01
- [x] App restart recovery restores playback state - 2026-04-01
- [x] Playback survives network loss scenarios - 2026-04-01

## Phase 9 - Remote Commands E2E
- [x] REBOOT_APP works end-to-end - 2026-04-01
- [x] SET_VOLUME works end-to-end - 2026-04-01
- [x] FORCE_REFRESH works end-to-end - 2026-04-01
- [x] SCREENSHOT capture-upload-preview works end-to-end - 2026-04-01
- [x] command_id idempotency and dedupe are implemented - 2026-04-01
- [x] ACK, timeout, retry, and command status tracking are implemented - 2026-04-01

## Phase 10 - Observability and Operations
- [x] Structured logs with correlation_id are implemented - 2026-04-01
- [x] Device heartbeat and health metrics are collected - 2026-04-01
- [x] Playback logs are ingested and queryable - 2026-04-01
- [x] Alert rules are defined (offline spike, command failure, sync latency) - 2026-04-01
- [x] Operational dashboards are available - 2026-04-01

## Phase 11 - Security Hardening
- [x] Validate JWT claims (iss, aud, exp, nbf) - 2026-04-01
- [x] Complete role-permission matrix - 2026-04-01
- [x] Pass tenant isolation tests - 2026-04-01
- [x] Enforce API input validation across endpoints - 2026-04-01
- [x] Define secrets rotation process - 2026-04-01
- [x] Support audit trail export - 2026-04-01

## Phase 12 - Testing Strategy
- [x] Backend unit tests cover critical services - 2026-04-01
- [x] API integration tests cover critical flows - 2026-04-01
- [x] Socket recovery tests cover reconnect and missed events - 2026-04-01
- [x] Android offline and airplane-mode tests are implemented - 2026-04-01
- [x] E2E tests cover pairing, sync, and remote commands - 2026-04-01
- [x] Regression checklist is documented - 2026-04-01
- [x] Bug triage template is adopted in issue workflow - 2026-04-01
- [x] Error management playbook is adopted in implementation workflow - 2026-04-01

## Phase 13 - Release and DevOps
- [x] Staging environment mirrors production essentials - 2026-04-01
- [x] Migration and rollback procedures are documented - 2026-04-01
- [x] Canary release process is enabled - 2026-04-01
- [x] Incident runbook is documented - 2026-04-01
- [x] S3 lifecycle and storage cost controls are enabled - 2026-04-01

## Phase 14 - Pilot Rollout
- [ ] Select pilot customer profile
- [ ] Run 10 to 20 screen pilot
- [ ] Measure pilot success criteria
- [ ] Close pilot blocker bug list
- [ ] Finalize onboarding documentation

## Phase 15 - Sales Readiness
- [ ] Finalize package tiers (Starter, Growth, Enterprise)
- [ ] Finalize pricing model (for example per-screen)
- [ ] Prepare sales demo scenario
- [ ] Prepare security and procurement package
- [ ] Finalize contract and SLA templates

## Phase 16 - Go Live
- [ ] Complete production readiness review
- [ ] Launch first paying customer
- [ ] Activate first-month KPI tracking
- [ ] Build first-month improvements backlog

## Phase 17 - Detailed Error Logging and Supportability
- [x] Define unified production error envelope with mandatory correlation_id on all failures - 2026-04-02
- [x] Implement global backend error middleware and structured exception logging - 2026-04-02
- [x] Add device-side error telemetry events for sync, playback, and command failures - 2026-04-02
- [x] Build tenant-scoped troubleshooting view (last commands, last sync, last heartbeat, last errors) - 2026-04-02
- [x] Define support bundle export format and runbook for customer issue triage - 2026-04-02
- [x] Add alert thresholds for recurring command timeout and sync failure spikes - 2026-04-02
- [x] Validate with support drill: reproduce issue, trace by correlation_id, and close with RCA - 2026-04-02

## Notes
- Add blockers, assumptions, and approvals here.
- 2026-04-02: Phase 14 started. Pilot execution is now active.
- 2026-04-02: User approved out-of-order execution to continue coding-focused work before completing pilot operations in Phase 14.
- 2026-04-02: Detailed error logging baseline validated (global error envelope, correlation_id propagation, and process-level error logging). Phase 14 transition is approved as CONDITIONAL-GO while Android runtime smoke reconnect stability remains tracked.
- Phase 7 physical-device smoke test is still recommended: publish a playlist to a real/emulated Android player and verify files are downloaded under app files directory, checksums pass, and staging-to-active swap succeeds.
- Mandatory phase gate policy is defined in tests/plans/mandatory-phase-test-gate-policy.md.
- Use tests/scripts/run-phase-gates.ps1 and store outputs in tests/reports/YYYY-MM-DD/ before any phase transition.