# PostgreSQL Migration Implementation Roadmap

Date: 2026-04-02  
Owner: Backend Architecture Team  
Status: **IN EXECUTION (Phase-23 complete; Android runtime publish-sync stabilization in progress)**

---

## Quick Start for Implementation Team

**Goal**: Migrate from MongoDB-only to PostgreSQL (primary) + MongoDB (archive) hybrid architecture **with production-grade reliability**.

**Duration**: 6+ weeks (includes production readiness gates)
**Risk Level**: Low-Medium (all code production-ready from start, comprehensive monitoring)
**Rollback Plan**: Circuit breaker auto-fallback to MongoDB, 30-day archive retention

⚠️ **CRITICAL: TEST COVERAGE GATE**

All new phases require passing test suite before approval. Test coverage is non-negotiable for production database migration:
- Every new endpoint must have integration test validating structure and authorization
- Every new script must have exit code validation
- Test failures (0 passing, 1+ failing) = phase blocked, no exceptions
- Current suite: 53 tests, 100% pass rate (ops + auth + pairing + validation + governance CLI + content lifecycle)
- Test file: `backend/src/routes/ops.route.test.ts`
- Run: `npm test -w backend`

**Phase Completion Workflow**:
1. Code implemented
2. `npm run lint -w backend` ✅
3. `npm test -w backend` ✅ (all tests pass)
4. Documentation updated  
5. Phase marked complete

If any test fails, revert to step 1 and fix code.

---

**Rollback Plan**: Circuit breaker auto-fallback to MongoDB, 30-day archive retention

## Execution Log (Live Sync)

**Completed Phases (Production-Ready):**
- ✅ Phase-1: Connection lifecycle with health checks
- ✅ Phase-2: Migration infrastructure with SQL runner
- ✅ Phase-3: Device sync with dual-write resilience
- ✅ Phase-4: Content & command shadow sync with error handling
- ✅ Phase-5: Controlled dual-read with fallback (10%→100% gradual rollout)
- ✅ **Phase-6: Production-Ready Infrastructure**
  - Structured logging (JSON with context)
  - Metrics tracking (Prometheus format)
  - Circuit breaker pattern for cascading failure prevention
  - Exponential backoff retry logic for transient failures
  - Comprehensive health check endpoints (`/metrics`, `/health/detailed`)
  - Type-safe error codes and context
- ✅ **Phase-7: Content Dual-Read Expansion (2026-04-02)**
  - Added resilient PostgreSQL read methods in `backend/src/repositories/content.repository.ts`
  - Enabled percentage-based dual-read for `GET /api/v1/content/playlists`
  - Preserved MongoDB fallback path when PostgreSQL read is unavailable
  - Updated app wiring in `backend/src/app.ts` to pass `readFromPostgresPercentage`
  - Validation: backend lint clean, tests 11/11 passing
- ✅ **Phase-8: Environment-Based Read Tuning (2026-04-02)**
  - Added automatic defaults in `backend/src/config/env.ts`:
    - `development` => 100%
    - `staging` => 50%
    - `production` => 10%
  - Preserved explicit `READ_FROM_POSTGRES_PERCENTAGE` override when provided
  - Validation: backend lint clean, tests 11/11 passing
- ✅ **Phase-9: Observability Integration (2026-04-02)**
  - Enhanced `GET /api/v1/ops/metrics` with `top_failing_devices_last_24h` panel data
  - Enhanced `GET /api/v1/ops/alerts/evaluate` with `heartbeat_drop` rule evaluation
  - Added current vs previous heartbeat window values for alert diagnostics
  - Validation: backend lint clean, tests 11/11 passing
- ✅ **Phase-10: Content Parity Diagnostics (2026-04-02)**
  - Added `GET /api/v1/ops/content/parity` for tenant-scoped Mongo/PostgreSQL parity diagnostics
  - Added sampled mismatch checks for media (`checksum_sha256`, `status`) and playlists (`version`, `item_count`)
  - Added script: `npm run db:check:content-parity -w backend`
  - Validation: backend lint clean, tests 11/11 passing
- ✅ **Phase-11: Rollout Guardrails Automation (2026-04-02)**
  - Added `GET /api/v1/ops/rollout/guardrails/evaluate` for automated promote/hold/block decisions
  - Added script: `npm run db:check:rollout-guardrails -w backend`
  - Decision criteria now combine parity status with evaluated alert severities
  - Validation: backend lint clean, tests 11/11 passing
- ✅ **Phase-12: SLO Breach Escalation & Release Gating (2026-04-02)**
  - Added `GET /api/v1/ops/slo/evaluate` for SLO health monitoring (command success, error rate, sync success, heartbeat health)
  - Added `GET /api/v1/ops/release-gate/evaluate` for combined release gate decisions (guardrails + SLOs)
  - Added script: `npm run db:check:slo-escalation -w backend`
  - SLOs tracked: command success rate (95%), error rate (<1%), sync success (98%), heartbeat health (90%)
  - Release gate blocks on critical guardrails OR SLO breaches, holds on warnings
  - Validation: backend lint clean, tests 11/11 passing
- ✅ **Phase-13: CI Parity Gate & Staged Rollout Promotion (2026-04-02)**
  - Added `GET /api/v1/ops/promotion/eligible` for evaluating promotion eligibility across environments
  - Added script: `npm run db:promote:via-parity -w backend` for CI/CD integration
  - Supports promotion path validation: dev → staging → prod (forward only)
  - Sample-based parity verification with configurable thresholds
  - Exit codes: 0 (success), 1 (parity failed), preventing unvalidated promotions
  - Validation: backend lint clean, tests 11/11 passing
- ✅ **Phase-14: Controlled Pilot Rollout Checkpoints (2026-04-02)**
  - Added `GET /api/v1/ops/pilot/checkpoints/evaluate` with staged pilot decisioning (`promote | hold | rollback`)
  - Added automated rollback triggers based on canary signals (error rate, command failure ratio, offline ratio, sync failure ratio)
  - Added rollout progress tracking (`current_percentage`, `next_checkpoint_percentage`, checkpoint path)
  - Added script: `npm run db:check:pilot-rollout -w backend`
  - Validation: backend lint clean, tests 30/30 passing
- ✅ **Phase-15: Multi-Region Deployment & Failover Patterns (2026-04-02)**
  - Added `GET /api/v1/ops/failover/evaluate` for regional failover readiness decisions
  - Added region-aware failover policy outputs (`stay_primary | prepare_failover | failover_now`)
  - Added canary failover thresholds for error rate, command failure ratio, offline ratio, and sync failure ratio
  - Added script: `npm run db:check:failover-readiness -w backend`
  - Validation: backend lint clean, tests 32/32 passing
- ✅ **Phase-16: Automated Canary Deployment & Rollback Triggering (2026-04-02)**
  - Added `GET /api/v1/ops/canary/deployment/evaluate` for progressive canary traffic decisions
  - Added automated rollback trigger output based on canary degradation thresholds
  - Added script: `npm run db:check:canary-deployment -w backend`
  - Added deployment recommendations (`recommended_traffic_percent`) for safe stepwise rollout
  - Validation: backend lint clean, tests 34/34 passing
- ✅ **Phase-17: Enterprise-Grade Incident Automation & Recovery Workflows (2026-04-02)**
  - Added `GET /api/v1/ops/incident/recovery/evaluate` for incident severity classification and recovery decisioning
  - Added automated incident actions (`create_incident_ticket`, `page_oncall`, `trigger_failover`, `trigger_canary_rollback`, `freeze_deployments`)
  - Added recovery runbook outputs by incident severity (`sev0` to `sev3`)
  - Added script: `npm run db:check:incident-recovery -w backend`
  - Validation: backend lint clean, tests 36/36 passing
- ✅ **Phase-18: Chaos Testing & Resilience Certification Gates (2026-04-02)**
  - Added `GET /api/v1/ops/chaos/resilience/certify` for chaos drill scoring and resilience certification decisions
  - Added gate decision states (`promote | hold | block`) tied to certification status (`certified | conditional | failed`)
  - Added recovery objective checks (RTO/RPO), MTTR scoring, and resilience checks for command recovery, sync success, and availability
  - Added script: `npm run db:check:chaos-resilience -w backend`
  - Validation: backend lint clean, tests 38/38 passing
- ✅ **Phase-19: Production Simulation Drills & Game-Day Readiness (2026-04-02)**
  - Added `GET /api/v1/ops/simulation/gameday/evaluate` for production simulation readiness and gate decisions
  - Added runbook timing evidence outputs and SLA evaluation (`within_sla`) for incident detect/escalate/recover/validate steps
  - Added readiness states (`ready | conditional | not_ready`) and deployment gate decisions (`promote | hold | block`)
  - Added script: `npm run db:check:game-day-readiness -w backend`
  - Validation: backend lint clean, tests 40/40 passing
- ✅ **Phase-20: Continuous Compliance Automation & Audit Evidence Pipelines (2026-04-02)**
  - Added `GET /api/v1/ops/compliance/evidence/evaluate` for compliance control scoring and evidence completeness checks
  - Added compliance states (`compliant | at_risk | non_compliant`) and gate decisions (`promote | hold | block`)
  - Added control checks for audit coverage, telemetry coverage, failure/error budgets, sync integrity, and retention policy
  - Added script: `npm run db:check:compliance-evidence -w backend`
  - Validation: backend lint clean, tests 42/42 passing
- ✅ **Phase-21: Autonomous Rollback Policy Tuning with SLO Budget Optimization (2026-04-02)**
  - Added `GET /api/v1/ops/rollback/policy/tune` for dynamic rollback threshold tuning and SLO burn-rate analysis
  - Added policy modes (`aggressive | balanced | relaxed`) with gate decisions (`promote | hold | block`)
  - Added risk scoring and budget burn metrics for error, command failure, sync, and availability budgets
  - Added script: `npm run db:check:rollback-policy -w backend`
  - Validation: backend lint clean, tests 44/44 passing
- ✅ **Phase-22: Multi-Tenant Anomaly Detection & Proactive Remediation Orchestration (2026-04-02)**
  - Added `GET /api/v1/ops/anomaly/remediation/evaluate` for tenant-vs-global anomaly analysis and remediation orchestration
  - Added anomaly states (`normal | warning | critical`) and remediation execution modes (`dry_run | execute`)
  - Added orchestration statuses (`not_required | queued | planned | executing`) with gate decisions (`promote | hold | block`)
  - Added script: `npm run db:check:anomaly-remediation -w backend`
  - Validation: backend lint clean, tests 46/46 passing
- ✅ **Phase-23: Policy-as-Code Governance with Automated Exception Workflows (2026-04-02)**
  - Added shared governance service: `backend/src/services/governance.service.ts`
  - Added endpoint: `GET /api/v1/ops/governance/exceptions/evaluate`
  - Added script: `npm run db:check:governance-exceptions -w backend`
  - Added governance CLI tests: `backend/src/scripts/check-governance-exceptions.test.ts`
  - Validation: backend lint clean, backend tests 53/53 passing

**Next Targets (Post-Phase-6):**
- Android player publish-sync stabilization and visual update reliability on large media payloads

---

## Production-Ready Code Standards (Applied from Phase-6)

**All future code MUST comply with these standards before deployment:**

### 1. Structured Logging
- Use `Logger` class from `src/lib/logger.ts`
- Log as JSON for easy parsing and monitoring
- Include operation name, tenant ID, error message (if applicable)
- Never use `console.log`, `console.error`

**Example:**
```typescript
const logger = new Logger('CommandRoute');
logger.info('Command dispatched', { tenantId, deviceId, commandId });
logger.error('Command dispatch failed', error, { context });
```

### 2. Resilience: Circuit Breaker + Retry
- Shadow writes: Use `withRetry()` for transient failures
- Shadow reads: Check `postgresCircuitBreaker.canExecute()` before trying PG
- On 5+ consecutive failures, circuit breaker auto-opens (30s timeout)
- All PostgreSQL failures are logged and tracked

**Example:**
```typescript
try {
  await withRetry(
    () => commandRepository.upsertShadowCommand(data),
    `shadow-write[${commandId}]`,
    { maxRetries: 2, initialDelayMs: 50 }
  );
} catch (error) {
  logger.error('Failed to shadow write', error, { context });
  // MongoDB fallback still works
}
```

### 3. Metrics Tracking
- All shadow operations recorded: writes, reads, failures, latencies
- Accessible via `/metrics` endpoint (Prometheus format)
- Available via `/health/detailed` endpoint (JSON diagnostic)
- Use `metrics.recordShadowWrite()`, `metrics.recordShadowRead()`

### 4. Health Checks
- `/health` → Basic status (pg connected, circuit breaker state)
- `/metrics` → Prometheus-scrape-compatible metrics
- `/health/detailed` → Diagnostic data (read failure rate %, latencies)

### 5. Error Codes
- All API errors use `code: "ERROR_TYPE"` + `message` pattern
- Shadow operations log detailed error context (error message, operation name, circuit breaker state)
- Never fail primary operation due to shadow failure (non-blocking)

---

## Week-by-Week Implementation Plan

### Week 1: Setup & Schema Deployment

**Day 1-2: Infrastructure Provisioning**
- [ ] Request PostgreSQL RDS instance (t3.large minimum, Multi-AZ)
  - CPU: 2vCPU, RAM: 8GB
  - Storage: 100GB gp3 (auto-scale to 500GB)
  - Backups: 30-day retention
  - Multi-region replica in standby region
- [ ] Configure security groups (allow backend only)
- [ ] Request AWS Secrets Manager entries for PG credentials
- [ ] Set up VPC peering between backend and PostgreSQL

**Day 3-5: Schema Deployment**
- [ ] Review all DDL from `postgresql-schema-implementation.md`
- [ ] Create dev/staging PostgreSQL instances (for testing)
- [ ] Deploy schema to staging:
  ```bash
  psql -h staging-rds.amazonaws.com < docs/architecture/postgresql-schema-implementation.md
  ```
- [ ] Verify all tables, indexes, RLS policies created
- [ ] Run smoke tests:
  ```sql
  SELECT * FROM devices LIMIT 1; -- Check RLS enforced
  SELECT count(*) FROM media; -- Should be 0
  INSERT INTO tenants (name, plan) VALUES ('Test', 'SMB'); -- Check auto-insert
  ```
- [ ] Seed initial roles and retention policies
- [ ] Deploy to production PostgreSQL (off-peak window)

**Acceptance Criteria**:
- ✅ PostgreSQL schema deployed to prod & staging
- ✅ RLS policies verified (query returns 0 rows without tenant context)
- ✅ Backup automation running (daily snapshots)
- ✅ Monitoring/alerting configured

---

### Week 2: Code Development & Dual-Write Implementation

**Day 6-7: Repository Pattern Implementation**
- [ ] Read `postgresql-code-integration.md` thoroughly
- [ ] Create `backend/src/lib/postgres.ts` (pool management)
- [ ] Create `backend/src/middlewares/tenant-context.middleware.ts` (RLS context)
- [ ] Create `backend/src/repositories/device.repository.ts` (CRUD operations)
- [ ] Create `backend/src/repositories/media.repository.ts` (S3 upload + dedup)
- [ ] Create `backend/src/repositories/command.repository.ts` (command dispatch)
- [ ] Unit test each repository (mock client, verify SQL)

**Day 8-10: Route Updates & Dual-Write**
- [ ] Update `backend/src/routes/device.route.ts` to use DeviceRepository
- [ ] Update `backend/src/routes/content.route.ts` for media uploads
- [ ] Update `backend/src/services/telemetry.service.ts` (write to MongoDB)
- [ ] Update `backend/src/services/command.service.ts` (PostgreSQL primary)
- [ ] **Enable dual-write**: Write to PostgreSQL AND MongoDB simultaneously
  ```typescript
  // Example: Device creation writes to both
  const pgDevice = await deviceRepository.create(tenantId, deviceData);
  const mongoDevice = await Device.create({ ...deviceData, _id: pgDevice.id });
  ```
- [ ] Add feature flag for dual-write (can be toggled off if errors)

**Acceptance Criteria**:
- ✅ All repositories implemented and unit tested
- ✅ Routes updated to use new repositories
- ✅ Dual-write enabled (both DBs receive writes)
- ✅ Code passes lint/eslint checks

---

### Week 3: Integration Testing & Data Validation

**Day 11-12: Staging Deployment**
- [ ] Build Docker image with updated code
- [ ] Deploy to staging environment
- [ ] Manually test key flows:
  - [ ] Device creation (verify in PostgreSQL)
  - [ ] Media upload (verify in S3 + PostgreSQL)
  - [ ] Pairing workflow (verify audit logs in PostgreSQL)
  - [ ] Command dispatch (verify in PostgreSQL + queue in Redis)
- [ ] Monitor logs for dual-write errors

**Day 13-14: Data Consistency Validation**
- [ ] Write data consistency checker script:
  ```typescript
  // Pseudo-code
  const pgDevices = await deviceRepository.findByTenant(tenantId);
  const mongoDevices = await Device.find({ tenant_id: tenantId });
  
  // Compare:
  // - Record counts match
  // - IDs match
  // - Updated timestamps within 1 second
  ```
- [ ] Run consistency checker every 1 hour
- [ ] Log any divergence to alerting system
- [ ] Reconcile any mismatches manually

**Day 15: Load Testing**
- [ ] Simulate production load:
  - 100 concurrent device creations
  - 1000 telemetry events/second
  - 50 command dispatches/second
- [ ] Monitor query latency:
  - PostgreSQL queries should average <100ms
  - MongoDB inserts should average <50ms
- [ ] Check for connection pool exhaustion

**Acceptance Criteria**:
- ✅ Staging deployment successful
- ✅ Data consistency checker passes hourly
- ✅ No divergence between PostgreSQL and MongoDB
- ✅ Load testing: p99 latency <500ms

---

### Week 4: Production Deployment & Gradual Cutover

**Day 16-17: Production Shadow Deploy**
- [ ] Deploy new code to production with feature flags:
  ```bash
  WRITE_TO_BOTH_DBS=false  # Read-only mode, no writes yet
  READ_FROM_POSTGRES_PERCENTAGE=0  # Still reading from MongoDB
  ```
- [ ] Run consistency checks (should see 0 PostgreSQL rows initially)
- [ ] Verify RLS policies work on prod schema
- [ ] All systems running, no errors

**Day 18: Enable Dual-Write**
- [ ] Set feature flag: `WRITE_TO_BOTH_DBS=true`
- [ ] Watch logs for 2-4 hours (look for write errors)
- [ ] Query both databases manually:
  ```sql
  SELECT count(*) FROM devices; -- PostgreSQL
  db.devices.count(); -- MongoDB
  ```
- [ ] Counts should match (within 1 minute)
- [ ] Run consistency checker every 5 minutes

**Day 19: Enable Read Verification (10% PostgreSQL)**
- [ ] Set feature flag: `READ_FROM_POSTGRES_PERCENTAGE=10`
- [ ] 10% of SELECT queries now read from PostgreSQL
- [ ] Monitor error rates:
  - Should remain <0.01%
  - Any errors = rollback to 0%
- [ ] Monitor latency:
  - PostgreSQL reads should be <100ms
  - If >200ms, investigate indexes
- [ ] Run for 12 hours

**Day 20: Increase Read Percentage (50% PostgreSQL)**
- [ ] Set: `READ_FROM_POSTGRES_PERCENTAGE=50`
- [ ] Run for 24 hours
- [ ] Monitor error rates, latency
- [ ] Check for any query pattern issues (SELECT *'s, N+1 queries)

**Day 21: Full Cutover (100% PostgreSQL Reads)**
- [ ] Set: `READ_FROM_POSTGRES_PERCENTAGE=100`
- [ ] Remove dual-read logic (only PostgreSQL)
- [ ] Still writing to both DBs (`WRITE_TO_BOTH_DBS=true`)
- [ ] Run for 48+ hours, validate all functionality
- [ ] Customer-facing tests from staging:
  - Device pairing works
  - Playlists sync correctly
  - Commands dispatch properly
  - Dashboard queries fast enough

**Acceptance Criteria**:
- ✅ Dual-write: 100% success rate (0 errors)
- ✅ Dual-read: Error rate <0.01%, latency acceptable
- ✅ Cutover: 48 hours of 100% PostgreSQL reads with no issues
- ✅ Data consistency: Checker passes 99+ times

---

### Week 5: Cleanup & Archive Setup

**Day 22-23: Remove Dual-Write**
- [ ] Set: `WRITE_TO_BOTH_DBS=false`
- [ ] Remove dual-write code from production
- [ ] MongoDB now read-only (for 30-day archive period)
- [ ] Monitor logs: Should see no MongoDB write errors

**Day 24-25: Archive Setup**
- [ ] Configure MongoDB retention policies:
  ```javascript
  // Keep 90-day hot telemetry
  db.telemetry.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 7776000 }
  );
  
  // Archive old data to S3 daily
  ```
- [ ] Set up nightly backup: MongoDB → S3
- [ ] Verify first backup completes successfully
- [ ] Document archival procedure

**Day 26: Documentation & Handoff**
- [ ] Update runbooks with PostgreSQL procedures
- [ ] Document connection strings / credentials location
- [ ] Create troubleshooting guide:
  - Slow queries → Use EXPLAIN ANALYZE
  - RLS errors → Check app.tenant_id context
  - Connection pool exhaustion → Add more connections
- [ ] Train on-call team on PostgreSQL (1-hour session)
- [ ] Schedule post-launch review (7 days after)

**Acceptance Criteria**:
- ✅ Dual-write removed, MongoDB read-only
- ✅ Archive procedures tested
- ✅ Documentation complete
- ✅ On-call trained

---

## Risk Mitigation Strategies

### Risk: Data Inconsistency During Migration

**Mitigation**:
- Run hourly consistency checker (count/checksum validation)
- Maintain detailed logs of every write
- Have SQL queries to identify divergence
- If divergence detected: Alert → Stop dual-write → Investigate

### Risk: Query Performance Regression

**Mitigation**:
- Profile all queries before/after migration
- Set performance budgets: p99 latency <500ms
- Gradual cutover (10%→50%→100%) allows early detection
- Have PostgreSQL read replica ready for failover

### Risk: RLS Policy Misconfiguration

**Mitigation**:
- Test RLS with multiple tenants in staging
- Verify tenant isolation:
  ```sql
  SET app.tenant_id = 'tenant-a';
  SELECT count(*) FROM devices; -- Should only show tenant-a devices
  ```
- Alert if a query returns non-matching tenant_id data

### Risk: Application Code Bugs

**Mitigation**:
- Comprehensive unit tests for all repositories
- Integration tests with real PostgreSQL (use Docker)
- Feature flags: Can toggle `READ_FROM_POSTGRES_PERCENTAGE` 0-100
- If error rate spikes: Immediately roll back to MongoDB

### Risk: Database Connection Pool Exhaustion

**Mitigation**:
- Monitor active connections: `SELECT count(*) FROM pg_stat_activity;`
- Set connection limit alerts at 80% capacity
- Use connection pooler (PgBouncer) if needed
- Test under load before production

---

## Validation Queries

Run these periodically to validate migration health:

```sql
-- Check table sizes
SELECT 
  schemaname, 
  tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Check slow queries (requires pg_stat_statements extension)
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check connection count
SELECT 
  datname,
  count(*) as connection_count
FROM pg_stat_activity
GROUP BY datname;

-- Check RLS working (should return 0 with wrong tenant_id)
SET app.tenant_id = '00000000-0000-0000-0000-000000000000';
SELECT count(*) FROM devices WHERE tenant_id != '00000000-0000-0000-0000-000000000000';
-- Should return 0 due to RLS policy
```

---

## Rollback Procedure (If Critical Issues)

**If error rate spikes or performance degrades**:

```bash
# Step 1: Immediately disable PostgreSQL reads
export READ_FROM_POSTGRES_PERCENTAGE=0
kubectl set env deployment/backend READ_FROM_POSTGRES_PERCENTAGE=0

# Step 2: Disable dual-write
export WRITE_TO_BOTH_DBS=false
kubectl set env deployment/backend WRITE_TO_BOTH_DBS=false

# Step 3: Monitor error rates (should return to normal in <5 mins)

# Step 4: Investigate root cause

# Step 5: Fix code / schema issue in staging

# Step 6: Once fixed, repeat Week 4 cutover procedure
```

**Post-Rollback**:
- Keep MongoDB as primary (go back to original architecture)
- Schedule proper investigation (1-2 week delay)
- Update schema/code with fixes discovered
- Retry migration with additional validation

---

## Success Criteria (Week 5 Complete)

- ✅ 100% of reads from PostgreSQL (0 MongoDB reads)
- ✅ PostgreSQL database contains complete dataset (same as MongoDB)
- ✅ Data consistency checker runs green for 7+ days
- ✅ Production queries have p99 latency <500ms
- ✅ RLS policies enforced (verified with manual tests)
- ✅ Audit log populated (monthly retention: 2-7 years depending on resource)
- ✅ Backup & disaster recovery procedures verified
- ✅ On-call runbooks updated & team trained
- ✅ Post-launch monitoring running (SLO tracking)

---

## Post-Launch Monitoring (Days 28-60)

**Daily Checks** (first 7 days):
- Keep database instance on high alert (page on any anomalies)
- Monitor PostgreSQL CPU, memory, disk usage
- Track slow query log daily
- Monitor connection pool health
- Verify backup jobs completing

**Weekly Checks** (weeks 2-4):
- Review slow query logs (identify indexes to add)
- Analyze backup recovery test (RTO/RPO verification)
- Compare query latency across different times of day
- Check storage growth rate (media uploads)

**Monthly Checks** (weeks 5-12):
- Run full disaster recovery drill
- Optimize detected slow queries (add indexes if needed)
- Review and adjust connection pool settings
- Cost analysis (PostgreSQL vs MongoDB costs)
- Archive old MongoDB data to S3

---

## Deliverables

From this document, implementation team should have access to:

1. **`docs/architecture/hybrid-database-design.md`**
   - Architecture overview and rationale
   - Data model split strategy
   - RLS configuration examples
   - Migration path details

2. **`docs/architecture/postgresql-schema-implementation.md`**
   - Complete DDL for all 11 tables
   - RLS policy definitions
   - Trigger and function implementations
   - Index optimization strategy
   - Deployment checklist

3. **`docs/architecture/postgresql-code-integration.md`**
   - Connection pool management
   - Repository pattern implementations
   - Route updates for DeviceRepository, MediaRepository
   - Dual-write service implementations
   - Testing checklist

4. **This Document: `postgresql-migration-implementation-roadmap.md`**
   - Week-by-week execution plan
   - Risk mitigation strategies
   - Validation queries for health checks
   - Rollback procedure
   - Success criteria

---

## Key Contacts & Escalation

| Role | Name | Contact | Availability |
|---|---|---|---|
| Database Lead | TBD | email@domain.com | On-call week 1-5 |
| Backend Lead | TBD | email@domain.com | Daily standups |
| DevOps | TBD | email@domain.com | Infrastructure issues |
| Security | TBD | email@domain.com | RLS/encryption reviews |

---

## Questions? 

Before starting:
- [ ] Read all 4 documents in order
- [ ] Schedule 1-hour architecture review with team
- [ ] Get PostgreSQL instance provisioning request submitted
- [ ] Identify 2-person team for code implementation (full-time, 5 weeks)
- [ ] Reserve production maintenance window (Week 4, 2-3 nights)

**Good luck with the migration!** 🚀

