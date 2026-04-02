# PostgreSQL + MongoDB Hybrid Database Design

Date: 2026-04-02  
Owner: Architecture, Backend  
Status: **CURRENT STATE**

## Current State

PostgreSQL is the operational primary for the implemented migration surface through Phase-22. MongoDB remains available for telemetry/archive and legacy reads where needed.

---

## Executive Summary

**Hybrid approach: PostgreSQL (operational primary) + MongoDB (telemetry/archive and legacy support)**

- **PostgreSQL**: Primary database for user data, devices, playlists, media metadata
- **MongoDB**: Telemetry archival, time-series data, flexible schema, legacy fallback where required
- **Result**: Stable current-state split with clear operational ownership

---

## Architecture Decision Matrix

| Requirement | PostgreSQL | MongoDB | Decision |
|---|---|---|---|
| **Multi-tenant data isolation** | ✅ RLS support | ✅ Sharding | **PostgreSQL (RLS recommended)** |
| **Transactional integrity** | ✅ ACID | ⚠️ Limited | **PostgreSQL** |
| **Schema migrations** | ⚠️ Strict | ✅ Flexible | **MongoDB for telemetry** |
| **Telemetry at scale** | ⚠️ Needs partitioning | ✅ Native | **MongoDB for hot telemetry** |
| **Query performance** (filtering) | ✅ Indexed | ✅ Good | **PostgreSQL for user queries** |
| **Storage efficiency** | ✅ Compact | ⚠️ 2-3x larger | **PostgreSQL for operational** |
| **TTL / auto-purging** | ⏳ Needs job | ✅ Native | **MongoDB for retention policy** |

---

## Data Model Split Strategy

### PostgreSQL (Operational Database)
**Purpose**: Transactional, multi-tenant, relational data  
**Scale**: ~240 GB (hot data)  
**Queries**: Real-time, filtered, frequently updated

**Tables**:
```
tenants
├── id (PK)
├── name
├── plan (SMB/Pro/Enterprise)
└── features JSONB

users
├── id (PK)
├── email (unique, global)
├── password_hash
├── tenant_id (FK, RLS)
├── roles JSONB
└── created_at, updated_at

devices
├── id (PK)
├── tenant_id (RLS filter)
├── hardware_id (unique per tenant)
├── name
├── current_playlist_id (FK)
├── status (online/offline/error)
└── last_heartbeat_at

playlists
├── id (PK)
├── tenant_id (RLS filter)
├── name
├── version
├── published_at
├── published_by (FK users)
└── items []

playlist_items
├── id (PK)
├── playlist_id (FK)
├── media_id (FK)
├── position
└── duration_ms

media
├── id (PK)
├── tenant_id (RLS filter)
├── filename
├── mime_type
├── size_bytes
├── checksum_sha256 (for dedup)
├── s3_url
├── created_at
└── uploaded_by (FK users)

commands
├── id (PK)
├── tenant_id (RLS filter)
├── device_id (FK)
├── type (REBOOT_APP, SET_VOLUME, FORCE_REFRESH, SCREENSHOT)
├── status (PENDING, DISPATCHED, ACKNOWLEDGED, COMPLETED)
├── payload JSONB
├── created_at
└── completed_at

pairing_codes
├── id (PK)
├── tenant_id (RLS filter)
├── code (6-digit)
├── device_id (FK)
├── expires_at
└── created_by (FK users)

pairing_audit
├── id (PK)
├── tenant_id (RLS filter)
├── device_id (FK)
├── event_type (CODE_GENERATED, CODE_CONFIRMED, DEVICE_PAIRED, PAIRING_REVOKED)
├── result (SUCCESS, FAILED)
├── reason (if failed)
└── timestamp

audit_log (immutable append-only)
├── id (PK)
├── tenant_id (RLS filter)
├── actor_id (FK users)
├── action (CREATE, UPDATE, DELETE, PUBLISH, COMMAND_DISPATCH)
├── resource_type (Device, Playlist, Media, Command)
├── resource_id
├── change JSONB (before/after values)
└── timestamp
```

### MongoDB (Telemetry & Archive)

**Purpose**: High-volume time-series, flexible schema, automatic retention  
**Scale**: ~1.6 GB/day telemetry ingestion  
**Queries**: Time-range filters, aggregations, archived data

**Collections**:

```js
// telemetry (hot - 90 days)
db.telemetry.insertOne({
  _id: ObjectId(),
  tenant_id: UUID,
  correlation_id: UUID,
  device_id: UUID,
  kind: "SYNC_SUCCESS" | "PLAYBACK_ERROR" | "COMMAND_ACK" | "DEVICE_OFFLINE",
  payload: {
    // Flexible schema per kind
    sync_duration_ms: 234,
    items_synced: 42,
    device_version: "1.2.3",
    error_code: null
  },
  timestamp: ISODate("2026-04-02T14:30:00Z")
})

// Index strategy
db.telemetry.createIndex({ tenant_id: 1, timestamp: -1 })
db.telemetry.createIndex({ correlation_id: 1 })
db.telemetry.createIndex({ device_id: 1, timestamp: -1 })

// TTL index (auto-delete after 90 days)
db.telemetry.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 })

// telemetry_archive (cold - 2 year retention)
// Same structure, but in separate collection
// Copied nightly from telemetry, TTL: 63072000 (2 years)

// commands_history (optional - for archive after 30 days)
db.commands_history.insertOne({
  _id: ObjectId(),
  tenant_id: UUID,
  device_id: UUID,
  command_id: UUID,
  type: "REBOOT_APP",
  status: "COMPLETED",
  dispatched_at: ISODate(...),
  acknowledged_at: ISODate(...),
  completed_at: ISODate(...),
  payload: { ... },
  created_at: ISODate(...)
})
```

---

## Data Flow Architecture

### Write Path (Data Ingestion)

```
User Action (Frontend)
    ↓
API Request (Backend)
    ↓
PostgreSQL Write (transactional)
    ├─ User → Create user record
    ├─ Playlist → Insert rows into playlists + playlist_items
    ├─ Media → Insert media metadata
    └─ Audit Log → Append to audit_log (immutable)
    ↓
[Async Job] MongoDB Write
    ├─ Telemetry → Insert into MongoDB telemetry collection
    └─ (TTL index auto-purges after 90 days)
    ↓
Redis Pub/Sub (real-time broadcast)
    ├─ playlist:sync:{tenant_id} → WebSocket broadcast
    └─ command:dispatch:{device_id} → Device listeners
    ↓
S3 Upload (if media file)
    └─ /media/{tenant_id}/{media_id}.{ext}
```

### Read Path (Data Retrieval)

```
Frontend Query
    ↓
PostgreSQL Query (primary)
    ├─ IF operational/recent data:
    │   └─ SELECT * FROM devices WHERE tenant_id = ? (RLS enforced)
    │   └─ Response: <100ms
    │
    ├─ IF telemetry/metrics (recent 7 days):
    │   └─ Query MongoDB telemetry (hot collection)
    │   └─ Response: <500ms
    │
    └─ IF archived data (>90 days old):
        └─ Query MongoDB telemetry_archive
        └─ Response: <2s (acceptable for historical)
```

---

## Row-Level Security (RLS) in PostgreSQL

### Setup

```sql
-- 1. Enable RLS on all tenant-scoped tables
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- ... etc for all tenant tables

-- 2. Create RLS policies
CREATE POLICY devices_tenant_isolation ON devices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY playlists_tenant_isolation ON playlists
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- 3. Set tenant context in application
-- (before every query)
SET app.tenant_id = '550e8400-e29b-41d4-a716-446655440000';

-- Now any query (SELECT, UPDATE, DELETE) is automatically filtered:
SELECT * FROM devices;  -- Only returns devices for current tenant
```

### Application Integration

```typescript
// backend/src/middlewares/tenant-context.middleware.ts

export async function tenantContextMiddleware(req, res, next) {
  // Extract tenant_id from JWT token
  const tenantId = req.auth.tenant_id;
  
  // Set PostgreSQL session variable
  await db.query('SET app.tenant_id = $1', [tenantId]);
  
  // All subsequent queries auto-filtered by tenant_id
  next();
}

// Usage in route
router.get('/devices', tenantContextMiddleware, async (req, res) => {
  // RLS automatically filters by tenant
  const devices = await Device.find({});
  // Only devices for current tenant returned
  res.json(devices);
});
```

---

## Indexing Strategy

### PostgreSQL Indexes

```sql
-- Multi-tenant access patterns
CREATE INDEX idx_devices_tenant_hw ON devices(tenant_id, hardware_id);
CREATE INDEX idx_playlists_tenant_name ON playlists(tenant_id, name);
CREATE INDEX idx_media_tenant_checksum ON media(tenant_id, checksum_sha256);
CREATE INDEX idx_commands_device_created ON commands(device_id, created_at DESC);
CREATE INDEX idx_audit_log_tenant_timestamp ON audit_log(tenant_id, timestamp DESC);

-- Deduplication
CREATE INDEX idx_media_checksum ON media(checksum_sha256);

-- Search
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_pairing_code ON pairing_codes(code);
```

### MongoDB Indexes

```javascript
// Telemetry indexing
db.telemetry.createIndex({ tenant_id: 1, timestamp: -1 });
db.telemetry.createIndex({ correlation_id: 1 });
db.telemetry.createIndex({ device_id: 1, timestamp: -1 });
db.telemetry.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // TTL

// Commands archive
db.commands_history.createIndex({ tenant_id: 1, device_id: 1, timestamp: -1 });
```

---

## Code Integration Patterns

### Reading from PostgreSQL

```typescript
// backend/src/services/device.service.ts

export async function getDevicesByTenant(tenantId: string) {
  // RLS is automatic - no need to filter manually
  const devices = await db.query(
    'SELECT * FROM devices WHERE tenant_id = $1',
    [tenantId]
  );
  // PostgreSQL RLS policy enforces tenant isolation
  return devices;
}

export async function getDeviceState(deviceId: string, tenantId: string) {
  const device = await db.query(
    'SELECT * FROM devices WHERE id = $1 AND tenant_id = $2',
    [deviceId, tenantId]
  );
  
  // Check cache first
  const cached = await redis.get(`device:${deviceId}:state`);
  if (cached) return JSON.parse(cached);
  
  // Store in cache (2hr TTL)
  await redis.setex(`device:${deviceId}:state`, 7200, JSON.stringify(device));
  return device;
}
```

### Writing to PostgreSQL + MongoDB

```typescript
// backend/src/services/telemetry.service.ts

export async function recordTelemetry(event: TelemetryEvent) {
  const { tenant_id, device_id, correlation_id, kind, payload, timestamp } = event;
  
  // 1. Write to MongoDB (async, non-blocking)
  mongodb.collection('telemetry').insertOne({
    tenant_id,
    device_id,
    correlation_id,
    kind,
    payload,
    timestamp: new Date(timestamp)
  }).catch(err => logger.error('Failed to insert telemetry', err));
  
  // 2. For critical correlations, also update PostgreSQL audit
  if (kind === 'COMMAND_ACK' || kind === 'PLAYBACK_ERROR') {
    await db.query(
      `INSERT INTO audit_log (tenant_id, actor_id, action, resource_type, resource_id, change, timestamp)
       VALUES ($1, NULL, 'TELEMETRY_RECEIVED', 'Telemetry', $2, $3, $4)`,
      [tenant_id, correlation_id, JSON.stringify(payload), new Date(timestamp)]
    );
  }
}

export async function getCommandTimeline(deviceId: string, tenantId: string) {
  // Get recent commands from PostgreSQL
  const recentCommands = await db.query(
    `SELECT * FROM commands 
     WHERE device_id = $1 AND tenant_id = $2 AND created_at > NOW() - INTERVAL '30 days'
     ORDER BY created_at DESC`,
    [deviceId, tenantId]
  );
  
  // Get telemetry correlations from MongoDB
  const correlationIds = recentCommands.map(c => c.id);
  const telemetry = await mongodb.collection('telemetry').find({
    tenant_id: tenantId,
    device_id: deviceId,
    correlation_id: { $in: correlationIds }
  }).toArray();
  
  // Merge for display
  return {
    commands: recentCommands,
    telemetry: telemetry
  };
}
```

### Media Upload (PostgreSQL metadata + S3)

```typescript
// backend/src/routes/content.route.ts

router.post('/media/upload', multer.single('file'), async (req, res) => {
  const file = req.file;
  const tenantId = req.auth.tenant_id;
  
  // 1. Calculate checksum for deduplication
  const checksum = await calculateSha256(file.buffer);
  
  // 2. Check if media already exists (dedup)
  const existing = await db.query(
    'SELECT id FROM media WHERE tenant_id = $1 AND checksum_sha256 = $2',
    [tenantId, checksum]
  );
  if (existing.length > 0) {
    return res.json({ id: existing[0].id, message: 'Duplicate media' });
  }
  
  // 3. Upload to S3
  const mediaId = uuidv4();
  const s3Key = `media/${tenantId}/${mediaId}`;
  await s3.putObject({
    Bucket: 'media-bucket',
    Key: s3Key,
    Body: file.buffer,
    ContentType: file.mimetype
  });
  
  // 4. Store metadata in PostgreSQL
  const media = await db.query(
    `INSERT INTO media (id, tenant_id, filename, mime_type, size_bytes, checksum_sha256, s3_url, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [mediaId, tenantId, file.originalname, file.mimetype, file.size, checksum, s3Key, req.auth.userId]
  );
  
  // 5. Append audit log
  await db.query(
    `INSERT INTO audit_log (tenant_id, actor_id, action, resource_type, resource_id, change, timestamp)
     VALUES ($1, $2, 'CREATE', 'Media', $3, $4, NOW())`,
    [tenantId, req.auth.userId, mediaId, JSON.stringify({ filename: file.originalname })]
  );
  
  res.json(media);
});
```

---

## Migration Path: MongoDB → PostgreSQL

### Phase 1: Shadow Schema (Week 1)
```
├─ Create PostgreSQL schema (devices, playlists, media, etc.)
├─ Background migration: Read from MongoDB, write to PostgreSQL
├─ Validate data integrity (row counts, checksums)
└─ Do NOT switch traffic yet
```

### Phase 2: Dual-Write (Week 2-3)
```
├─ Code: Write to both MongoDB and PostgreSQL
├─ Reads: Still from MongoDB
├─ Monitor PostgreSQL write latency, errors
└─ Reconcile divergence (MongoDB = source of truth)
```

### Phase 3: Dual-Read (Week 3-4)
```
├─ Reads: 10% from PostgreSQL, 90% from MongoDB
├─ Validate query results match
├─ Gradually increase PostgreSQL ratio (25% → 50% → 75%)
└─ Monitor app metrics (latency, errors)
```

### Phase 4: Cutover (Week 4)
```
├─ Reads: 100% from PostgreSQL
├─ Writes: Single-write to PostgreSQL (dual-write removed)
├─ Keep MongoDB as read-only replica (30 days)
└─ Monitor SLAs closely
```

### Phase 5: Cleanup (Week 5+)
```
├─ Archive MongoDB (S3 backup)
├─ Decommission MongoDB cluster
└─ Document final schema & lessons learned
```

---

## Monitoring & SLOs

### Performance Targets

| Metric | Target | Tool |
|--------|--------|------|
| Device query latency (p99) | <100ms | CloudWatch |
| Playlist publish latency | <500ms | Apollo/NewRelic |
| Telemetry ingest latency | <1s | DataDog |
| Command dispatch latency | <200ms | NewRelic |
| Monthly uptime | ≥99.5% | PagerDuty |

### Alerting Thresholds

```yaml
Alerts:
  - PostgreSQL CPU > 80% for 5 min → Page on-call
  - Query latency p99 > 500ms → Alert (investigate)
  - MongoDB ingest rate > 200K/sec → Alert (scale)
  - Failed telemetry writes > 0.1% → Alert (circuit breaker)
  - Replication lag > 1 sec → Alert (failover risk)
```

---

## Disaster Recovery

### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: <4 hours
- **RPO (Recovery Point Objective)**: <1 hour

### Backup Strategy
```
PostgreSQL:
├─ Daily snapshots (automated)
├─ Multi-region replication
├─ Point-in-time recovery (30 days)
└─ Test recovery monthly

MongoDB:
├─ Daily backups to S3
├─ 2-year retention (cold storage)
└─ Archive-only after cutover (immutable telemetry)
```

### Failover Procedure
```
1. Detect primary DB failure (health check fails)
2. Promote read replica (automatic in RDS/Atlas)
3. Update connection strings (DNS failover)
4. Validate data consistency
5. Notify on-call + customers
```

---

## Security Considerations

### Data Classification

| Data Type | Classification | Encryption | Storage |
|-----------|---|---|---|
| User credentials | Sensitive | ✅ BCrypt hash | PostgreSQL |
| Tenant metadata | Restricted | ✅ TLS in-transit | PostgreSQL |
| Device state | Internal | ✅ TLS in-transit | PostgreSQL + Redis |
| Media files | Confidential | ✅ SSE-KMS | S3 |
| Telemetry | Internal | ✅ TLS in-transit | MongoDB |

### Encryption Implementation

```typescript
// backend/src/services/encryption.service.ts

export class EncryptionService {
  async encryptField(value: string, fieldType: string): Promise<string> {
    // Field-level encryption for sensitive data
    const key = await this.getKmsKey(fieldType);
    return kms.encrypt(value, key);
  }
  
  async decryptField(encrypted: string, fieldType: string): Promise<string> {
    const key = await this.getKmsKey(fieldType);
    return kms.decrypt(encrypted, key);
  }
}

// Usage: Encrypt user passwords, API keys, secrets
const passwordHash = await encryption.encryptField(password, 'PASSWORD');
```

### Access Control

```typescript
// backend/src/middlewares/rbac.middleware.ts

export async function rbacMiddleware(req, res, next) {
  const user = req.auth;
  
  // Set tenant context for RLS
  await db.query('SET app.tenant_id = $1', [user.tenant_id]);
  
  // Check role permissions
  if (!user.roles.includes(requiredRole)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  next();
}
```

---

## Configuration Example

### .env.production

```bash
# PostgreSQL
PG_HOST=prod-postgresql.rds.amazonaws.com
PG_PORT=5432
PG_DATABASE=remote_screen_prod
PG_USER=app_user
PG_PASSWORD=<SECRETS_MANAGER>

# MongoDB (for telemetry archive)
MONGO_URI=mongodb+srv://app_user:<password>@cluster.mongodb.net/remote_screen_telemetry

# Redis
REDIS_URL=redis://prod-redis.elasticache.amazonaws.com:6379

# S3  
AWS_REGION=us-east-1
S3_BUCKET=remote-screen-media
S3_PREFIX=production/

# Encryption
KMS_KEY_ID=<AWS_KMS_KEY_ARN>

# Monitoring
DATADOG_API_KEY=<KEY>
SENTRY_DSN=<DSN>
```

---

## Success Criteria

- [ ] All 11 PostgreSQL tables created + indexed
- [ ] MongoDB telemetry collection + TTL configured
- [ ] RLS policies enforced on all tenant tables
- [ ] Dual-write code path tested
- [ ] Migration procedure validated (shadow → dual-write → dual-read → cutover)
- [ ] Performance targets met (query latency <100ms)
- [ ] Disaster recovery drill passed (RTO <4h)
- [ ] Security audit completed (encryption, access control)
- [ ] Monitoring & alerting configured
- [ ] Production rollout plan documented

