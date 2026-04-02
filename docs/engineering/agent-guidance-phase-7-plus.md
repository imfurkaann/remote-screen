## Agent Guidance: How to Continue After Phase-6

**Written**: 2026-04-02  
**For**: AI agents and engineers implementing Phase-7+  
**Key Rule**: All code is **production-ready from the start** - no refactoring later

---

## What You Inherited (Phase-6 Completion)

### ✅ Production-Ready Infrastructure (Now in Code)
1. **Logging**: `backend/src/lib/logger.ts` - JSON structured logs with context
2. **Metrics**: `backend/src/lib/metrics.ts` - Prometheus-format observability
3. **Circuit Breaker**: `backend/src/lib/circuit-breaker.ts` - Auto-fallback on 5 failures
4. **Retry Logic**: `backend/src/lib/retry.ts` - Exponential backoff (2x each attempt)

### ✅ Production-Ready Data Access Layer
- `backend/src/repositories/device.repository.ts` - Device pairing shadow sync
- `backend/src/repositories/content.repository.ts` - Media/playlist shadow sync
- `backend/src/repositories/command.repository.ts` - Command shadow write + read

### ✅ Production-Ready Routes
- `backend/src/routes/command.route.ts` - Command dispatch + dual-read (with fallback)
- `backend/src/routes/health.route.ts` - `/metrics` + `/health/detailed` endpoints

### ✅ Validated
- All TypeScript type errors fixed
- 11/11 tests passing
- No console.* statements (all structured logging)
- All shadow operations have retry + circuit breaker protection

---

## The Production-First Pattern (How to Build Phase-7+)

### Rule 1: Logging > Console
```typescript
// ❌ WRONG - never do this
console.log("Device created", device);
console.error("Failed to sync", error);

// ✅ CORRECT - use Logger
const logger = new Logger('DeviceRoute');
logger.info('Device created', { deviceId: device.id, tenantId });
logger.error('Failed to sync', error, { deviceId, context });
```

### Rule 2: Retry on Transient Failures
```typescript
// ❌ WRONG - direct call with no resilience
await commandRepository.upsertShadowCommand(input);

// ✅ CORRECT - use withRetry for shadow operations
await withRetry(
  () => commandRepository.upsertShadowCommand(input),
  `shadow-command-upsert[${commandId}]`,
  { maxRetries: 2, initialDelayMs: 50 }
);
```

### Rule 3: Circuit Breaker Before PG Reads
```typescript
// ❌ WRONG - no circuit breaker check
const rows = await commandRepository.listShadowCommands(tenantId, deviceId);

// ✅ CORRECT - circuit breaker protects availability
if (postgresCircuitBreaker.canExecute()) {
  const rows = await commandRepository.listShadowCommands(tenantId, deviceId);
  // Handle rows...
} else {
  // Gracefully fallback to MongoDB
}
```

### Rule 4: Track Metrics for All Shadow Ops
```typescript
// ✅ CORRECT - repository methods record metrics
// (CommandRepository.listShadowCommands already does this)
metrics.recordShadowRead('postgres', latencyMs);

// Every shadow operation updates these counters:
// - total attempts
// - successes vs failures
// - latency (for p95 monitoring)
```

### Rule 5: Pass Error Context to Logs
```typescript
// ❌ WRONG - lost context
logger.error('Failed', error);

// ✅ CORRECT - full context for debugging
logger.error('Failed to dispatch command', error, {
  tenantId,
  deviceId,
  commandId,
  errorMessage: err.message,
  circuitBreakerState: postgresCircuitBreaker.getState()
});
```

---

## Phase-7 Implementation Pattern (Example)

**Goal**: Expand dual-read to content GET endpoints

**Step 1: Check Repository Already Has Read Methods**
```typescript
// Already exists in ContentRepository?
async getMedia(tenantId: string, mediaId: string): Promise<ShadowMediaRow | null>
async listPlaylists(tenantId: string, limit: number): Promise<ShadowPlaylistRow[]>
```

**Step 2: Update Content Route with Production Pattern**
```typescript
// 1. Import
import { Logger } from '../lib/logger.js';
import { postgresCircuitBreaker } from '../lib/circuit-breaker.js';
import { metrics } from '../lib/metrics.js';
import { contentRepository } from '../repositories/content.repository.js';

const logger = new Logger('ContentRoute');

// 2. Add to route depends
type ContentRouteDeps = {
  // ... existing deps
  readFromPostgresPercentage: number;
};

// 3. In GET /playlists endpoint
if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
  const mediaRows = await contentRepository.listPlaylists(tenantId, limit);
  if (mediaRows && mediaRows.length > 0) {
    logger.debug('Served playlists from PostgreSQL', { count: mediaRows.length });
    metrics.recordShadowRead('postgres', latencyMs);
    res.json({ playlists: mediaRows.map(convertFromShadowRow) });
    return;
  }
}

// 4. Fallback to MongoDB
const playlists = await PlaylistModel.find({ tenantId });
metrics.recordShadowRead('mongo', latencyMs);
res.json({ playlists });
```

**Step 3: Test & Lint**
```bash
npm run lint -w backend  # Must be zero errors
npm test -w backend      # Must be all passing
```

---

## Checklist for Writing Production-Ready Code

Before ANY merge/commit:

- [ ] All logs use `Logger` class (no `console.*`)
- [ ] All shadow writes use `withRetry()`
- [ ] All shadow reads check `postgresCircuitBreaker.canExecute()`
- [ ] All operations record metrics
- [ ] All error logs include context (tenantId, operationName, errorMessage)
- [ ] TypeScript lint passes: `npm run lint -w backend`
- [ ] Test suite passes: `npm test -w backend`
- [ ] No undefined behavior (all error paths have handlers)
- [ ] Fallbacks exist for all PostgreSQL failures

---

## Key Files Reference

| File | Purpose | Edit For... |
|------|---------|----------|
| `src/lib/logger.ts` | Structured JSON logging | Adding new log features |
| `src/lib/metrics.ts` | Observability tracking | Adding new metrics |
| `src/lib/circuit-breaker.ts` | Failure resilience | Tuning failure thresholds |
| `src/lib/retry.ts` | Transient failure recovery | Tuning backoff strategy |
| `src/repositories/*.ts` | Data access layer | Adding read/write operations |
| `src/routes/*.ts` | API endpoints | Adding dual-read/write logic |
| `src/routes/health.route.ts` | Health checks | Adding new diagnostic endpoints |

---

## Deployment Workflow

1. **Local Development**
   - Write code following production pattern
   - Test: `npm test -w backend`
   - Lint: `npm run lint -w backend`

2. **Code Review**
   - Peer reviews checklist above
   - Must pass all checks before approval

3. **Staging Deployment**
   - Run same tests in staging
   - Verify `/metrics` endpoint (Prometheus data)
   - Run `npm run db:check:shadow` to validate consistency

4. **Production Deployment**
   - Monitor circuit breaker: `curl /health/detailed | jq .postgres`
   - Monitor metrics: `curl /metrics | head -20`
   - First 48 hours: hourly consistency checks

---

## Remember

> **Code written for Phase-6+ is code written for production, from day one.**
>
> No refactoring "later" when things slow down. No "we'll add logging if there's a problem."
> Everything is observable, resilient, and tested from the start.

---

## Questions?

1. "Can I use console.log?" → No. Use Logger.
2. "Do I need to handle the error?" → Yes. Always log + record metrics.
3. "Should I retry this operation?" → If it's a shadow write/read, yes (circuit breaker + retry).
4. "Is my code production-ready?" → Only if lint + tests pass AND is follows checklist above.

---

**Happy coding! 🚀 Let's build systems that don't break at 3am.**
