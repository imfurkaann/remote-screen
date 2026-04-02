## Phase-6 Production-Ready Deployment Checklist

**Status**: ✅ COMPLETE (2026-04-02)  
**Test Results**: 11/11 passing, 0 type errors  
**Code Review Gate**: All files must pass before merge to main

---

### Pre-Deployment Validation

- ✅ TypeScript compilation: `npm run lint -w backend`
  - Result: Zero errors
  
- ✅ Test suite: `npm test -w backend`
  - Result: 11/11 tests passing
  - Duration: ~1.6 seconds
  - Coverage: Auth, roles, middleware, pairing abuse protections, rate limiting

- ✅ Production-ready infrastructure code review:
  - ✅ Logger: Structured JSON, context tracking, error stack
  - ✅ Metrics: Prometheus format, latency tracking, read source distribution
  - ✅ Circuit breaker: CLOSED/OPEN/HALF_OPEN states, exponential timeout
  - ✅ Retry: Exponential backoff with jitter, max 3 attempts
  - ✅ Repositories: All use logger + retry + circuit breaker
  - ✅ Routes: Detailed error codes, context logging
  - ✅ Health endpoints: `/metrics`, `/health/detailed` implemented

---

### Deployment Steps (Phase-6 → Staging)

**1. Code Promotion to Staging**
```bash
git add backend/src/lib/{logger,metrics,circuit-breaker,retry}.ts
git add backend/src/repositories/{device,content,command}.repository.ts
git add backend/src/routes/{command,health}.route.ts
git commit -m "Phase-6: Production-ready infrastructure (logging, metrics, CB, retry)"
git push origin phase-6-production-infrastructure
# Create pull request to staging branch
```

**2. Pre-Staging Verification**
```bash
# Run full test suite
npm run lint -w backend
npm test -w backend

# Smoke test: health endpoints
curl http://localhost:4100/api/v1/health
curl http://localhost:4100/api/v1/metrics
curl http://localhost:4100/api/v1/health/detailed
```

**3. Staging Deployment**
- [ ] Deploy code to staging backend server
- [ ] Verify PostgreSQL connection in staging
- [ ] Check circuit breaker state: `curl /api/v1/health/detailed | jq .postgres.circuitBreaker`
- [ ] Monitor metrics endpoint for first 30 minutes
- [ ] Verify logs are JSON format: `docker logs backend-staging | head -10 | jq .`

**4. Staging Validation (30 minutes)**
- [ ] Create 5 devices via pairing flow
- [ ] Check shadow writes: `npm run db:check:shadow -w backend`
- [ ] Verify MongoDB and PostgreSQL counts match
- [ ] Test command dispatch GET with `READ_FROM_POSTGRES_PERCENTAGE=0` (should use MongoDB)
- [ ] Test command dispatch GET with `READ_FROM_POSTGRES_PERCENTAGE=100` (should use PostgreSQL)
- [ ] Verify metrics endpoint updates: `curl /api/v1/metrics | grep shadow_reads`
- [ ] Check `/health/detailed` shows PostgreSQL healthy state

**5. Production Rollout Criteria**
```
APPROVED for production if:
✅ All tests passing in staging
✅ No TypeScript errors
✅ Circuit breaker stays CLOSED (zero failures during test)
✅ Shadow write latency < 10ms p95
✅ Shadow read latency < 5ms p95
✅ Mongo/PG consistency check = 100%
```

---

### Post-Deployment (First 48 Hours)

**Hour 0-4: Immediate monitoring**
- [ ] Monitor backend logs for errors
- [ ] Check `/metrics` endpoint: shadow_writes_failed should be 0
- [ ] Check `/health/detailed`: circuit breaker state = CLOSED
- [ ] Verify pairing flow works (create 3 test devices)

**Hour 4-24: Extended monitoring**
- [ ] Run `db:check:shadow` every 4 hours
- [ ] Monitor shadow_reads metrics: postgres vs mongo distribution
- [ ] Alert if circuit breaker opens (5+ consecutive failures)
- [ ] Check average latencies via `/health/detailed`

**Hour 24-48: Stability confirmation**
- [ ] No circuit breaker openings = phase complete
- [ ] Shadow consistency 100% = ready for Phase-7
- [ ] Postgres health = CLOSED = stable

---

### Rollback Plan (if needed)

**Immediate Rollback (anytime before Phase-7)**
```bash
# All shadow writes default to non-blocking
# All shadow reads default to fallback to MongoDB
# Simply disable PG_ENABLED or reduce READ_FROM_POSTGRES_PERCENTAGE to 0
export PG_ENABLED=false        # Disables all shadow writes
export READ_FROM_POSTGRES_PERCENTAGE=0  # Forces all reads to MongoDB
```

**Zero-downtime rollback:**
- Shadow operations are async (non-blocking)
- If rollback occurs, MongoDB remains source of truth
- 30-day PostgreSQL retention policy kick in (archive only)
- No data loss

---

### Phase-6 Summary

**What's new:**
1. Production-grade observability (structured logs + metrics)
2. Automatic resilience (circuit breaker + retry)
3. Detailed health diagnostics (`/metrics`, `/health/detailed`)
4. Type-safe error handling across all operations

**Guardrails in place:**
- Circuit breaker auto-opens on 5 PostgreSQL failures (30s timeout)
- Shadow writes auto-retry up to 3 times with exponential backoff
- All failures logged WITH context for debugging
- Consistent fallback to MongoDB if PostgreSQL unavailable

**Ready for:**
- Phase-7: Expand dual-read to content endpoints
- Phase-8: Environment-based percentage tuning
- Phase-9: Production observability dashboards

---

### Future Phases: How to Maintain Phase-6 Standards

**All future code additions MUST:**
- ✅ Use `Logger` class (never `console.*`)
- ✅ Wrap repository operations with `withRetry()`
- ✅ Check `postgresCircuitBreaker.canExecute()` before PG reads
- ✅ Record metrics: `metrics.recordShadowWrite()`, `metrics.recordShadowRead()`
- ✅ Provide error context in log calls
- ✅ Pass all tests: `npm test -w backend`
- ✅ Pass TypeScript lint: `npm run lint -w backend`

**Code review gate:** Code without these standards WILL NOT be merged.
