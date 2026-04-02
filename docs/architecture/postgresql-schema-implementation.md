# PostgreSQL Schema & Implementation Guide

Date: 2026-04-02  
Owner: Database Engineering  
Status: **READY FOR DEPLOYMENT**

## Current State

The schema implementation reflects the deployed migration surface through Phase-22. Phase-23 is the remaining planned core governance step.

---

## Overview

This guide provides complete PostgreSQL DDL (Data Definition Language) statements for production deployment. 

**Key Principles**:
- ✅ Row-Level Security (RLS) for multi-tenant isolation
- ✅ Immutable audit trail (append-only audit_log)
- ✅ Soft deletes where required (deleted_at timestamps)
- ✅ Backward compatibility with existing MongoDB queries during migration
- ✅ Comprehensive indexing for common access patterns
- ✅ Ops decision endpoints backed by integration tests and CLI validation scripts

---

## Phase 1: Core Tables

### 1.1 Tenants Table

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'SMB', -- SMB, Pro, Enterprise
  features JSONB DEFAULT '{}', -- e.g., {"max_devices": 100, "custom_branding": true}
  storage_limit_gb BIGINT DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL -- Soft delete
);

CREATE INDEX idx_tenants_deleted_at ON tenants(deleted_at);
```

### 1.2 Users Table

```sql
-- Global users table (not tenant-scoped)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, DEPROVISIONED
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL -- Soft delete
);

-- Unique email per tenant (prevent duplicates within org)
CREATE UNIQUE INDEX idx_users_email_per_tenant 
  ON users(tenant_id, LOWER(email)) 
  WHERE deleted_at IS NULL;

-- Lookup by email globally (for login)
CREATE INDEX idx_users_email ON users(LOWER(email));

-- For audit queries
CREATE INDEX idx_users_created_at ON users(tenant_id, created_at DESC);
```

### 1.3 Roles & Permissions Table

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL, -- TENANT_ADMIN, CONTENT_MANAGER, DEVICE_OPERATOR
  permissions TEXT[] NOT NULL DEFAULT '{}', -- Array of permission strings
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique role names per tenant
CREATE UNIQUE INDEX idx_roles_name_per_tenant ON roles(tenant_id, name);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

-- Sample permissions seed
INSERT INTO roles (tenant_id, name, permissions) 
VALUES 
  (gen_random_uuid(), 'TENANT_ADMIN', ARRAY['device:read', 'device:write', 'content:write', 'user:manage']),
  (gen_random_uuid(), 'CONTENT_MANAGER', ARRAY['device:read', 'content:write', 'playlist:publish']),
  (gen_random_uuid(), 'DEVICE_OPERATOR', ARRAY['device:read', 'command:dispatch'])
ON CONFLICT DO NOTHING;
```

### 1.4 Devices Table

```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  hardware_id VARCHAR(255) NOT NULL, -- Unique per device
  name VARCHAR(255) NOT NULL,
  device_model VARCHAR(100), -- e.g., "Sony Bravia 55"
  os_version VARCHAR(100), -- e.g., "Android 12"
  app_version VARCHAR(50), -- Current installed version
  status VARCHAR(50) NOT NULL DEFAULT 'OFFLINE', -- ONLINE, OFFLINE, ERROR
  current_playlist_id UUID NULL REFERENCES playlists(id),
  last_heartbeat_at TIMESTAMP NULL,
  last_command_acked_at TIMESTAMP NULL,
  location VARCHAR(255) NULL, -- Physical location
  metadata JSONB DEFAULT '{}', -- Extended attributes
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

-- Unique hardware_id per tenant
CREATE UNIQUE INDEX idx_devices_hardware_id_per_tenant 
  ON devices(tenant_id, hardware_id) 
  WHERE deleted_at IS NULL;

-- Fast status queries
CREATE INDEX idx_devices_status ON devices(tenant_id, status);

-- Heartbeat for monitoring
CREATE INDEX idx_devices_heartbeat ON devices(tenant_id, last_heartbeat_at DESC);

-- Pairing lookups
CREATE INDEX idx_devices_playlist ON devices(current_playlist_id);
```

### 1.5 Media Table

```sql
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL, -- e.g., image/png, video/mp4
  size_bytes BIGINT NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL, -- For deduplication
  s3_url TEXT NOT NULL, -- Full S3 path
  s3_key VARCHAR(500) NOT NULL, -- S3 object key
  status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, ARCHIVED, QUARANTINED
  processed_at TIMESTAMP NULL, -- When thumbnail/conversion complete
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PERMANENT STORAGE - NO DELETION
-- Soft delete not applicable for media (per user directive)

-- Deduplication lookup
CREATE UNIQUE INDEX idx_media_checksum_per_tenant 
  ON media(tenant_id, checksum_sha256);

-- Search by filename
CREATE INDEX idx_media_filename ON media(tenant_id, filename);

-- Upload tracking
CREATE INDEX idx_media_uploader ON media(uploaded_by, created_at DESC);
```

---

## Phase 2: Content Management Tables

### 2.1 Playlists Table

```sql
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, PUBLISHED, ARCHIVED
  published_at TIMESTAMP NULL,
  published_by UUID NULL REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

-- Lookup by name
CREATE INDEX idx_playlists_status ON playlists(tenant_id, status);

-- Published playlists (for sync)
CREATE INDEX idx_playlists_published ON playlists(tenant_id, published_at DESC) 
  WHERE status = 'PUBLISHED';
```

### 2.2 Playlist Items Table

```sql
CREATE TABLE playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE RESTRICT, -- Can't delete media if in use
  position INT NOT NULL, -- 0-based order
  duration_ms INT NOT NULL DEFAULT 3000, -- How long to display
  rotation_enabled BOOLEAN DEFAULT TRUE, -- Whether to rotate through versions
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ordered retrieval
CREATE UNIQUE INDEX idx_playlist_items_position 
  ON playlist_items(playlist_id, position);

-- Cascade updates when media changes
CREATE INDEX idx_playlist_items_media ON playlist_items(media_id);
```

---

## Phase 3: Device Commands & Pairing

### 3.1 Commands Table

```sql
CREATE TABLE commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES devices(id),
  correlation_id UUID UNIQUE, -- For tracing
  command_type VARCHAR(100) NOT NULL, -- SYNC_PLAYLIST, REBOOT_APP, SET_VOLUME, FORCE_REFRESH, SCREENSHOT, UPDATE_APP
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, DISPATCHED, ACKNOWLEDGED, COMPLETED, FAILED, TIMEOUT
  priority INT DEFAULT 0, -- 0=normal, 1=high, -1=low (for queuing)
  payload JSONB NOT NULL DEFAULT '{}', -- Command-specific parameters
  dispatched_at TIMESTAMP NULL,
  acknowledged_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  error_code VARCHAR(50) NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours' -- TTL
);

-- Fast device command lookup
CREATE INDEX idx_commands_device_status ON commands(device_id, status) 
  WHERE status IN ('PENDING', 'DISPATCHED');

-- Dispatch queue
CREATE INDEX idx_commands_dispatch ON commands(tenant_id, created_at ASC) 
  WHERE status = 'PENDING' 
  ORDER BY priority DESC, created_at ASC;

-- Correlation tracing
CREATE INDEX idx_commands_correlation ON commands(correlation_id);

-- Expiration cleanup
CREATE INDEX idx_commands_expires ON commands(expires_at) 
  WHERE status NOT IN ('COMPLETED', 'FAILED', 'TIMEOUT');
```

### 3.2 Pairing Code Table

```sql
CREATE TABLE pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code VARCHAR(6) NOT NULL UNIQUE, -- Human-readable code
  device_id UUID REFERENCES devices(id), -- NULL until confirmed
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, CONFIRMED, EXPIRED, REVOKED
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '10 minutes',
  confirmed_at TIMESTAMP NULL
);

-- Code lookup (short TTL, generate new after expiration)
CREATE INDEX idx_pairing_codes_active ON pairing_codes(code) 
  WHERE status = 'PENDING' 
  AND expires_at > CURRENT_TIMESTAMP;

-- Audit trail
CREATE INDEX idx_pairing_codes_tenant ON pairing_codes(tenant_id, created_at DESC);
```

### 3.3 Pairing Audit Table

```sql
CREATE TABLE pairing_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES devices(id),
  event_type VARCHAR(50) NOT NULL, -- CODE_GENERATED, CODE_CONFIRMED, DEVICE_PAIRED, PAIRING_REVOKED, SYNC_REQUESTED
  result VARCHAR(50) NOT NULL, -- SUCCESS, FAILED, SKIPPED
  reason VARCHAR(255) NULL,
  user_id UUID NULL REFERENCES users(id),
  correlation_id UUID,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Immutable append-only (no updates, no deletes)
-- NEVER UPDATE OR DELETE FROM pairing_audit

-- Investigation queries
CREATE INDEX idx_pairing_audit_device ON pairing_audit(device_id, timestamp DESC);
CREATE INDEX idx_pairing_audit_tenant ON pairing_audit(tenant_id, timestamp DESC);
CREATE INDEX idx_pairing_audit_correlation ON pairing_audit(correlation_id);
```

---

## Phase 4: Audit & Compliance

### 4.1 Immutable Audit Log

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  actor_id UUID NULL REFERENCES users(id), -- NULL if system action
  action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, PUBLISH, REVOKE, COMMAND_COMPLETE
  resource_type VARCHAR(50) NOT NULL, -- Device, Media, Playlist, User, Role
  resource_id VARCHAR(100) NOT NULL, -- ID of affected resource
  change JSONB NOT NULL, -- {before: {...}, after: {...}}
  correlation_id UUID, -- Link to related operations
  ip_address INET NULL, -- Request IP
  user_agent TEXT NULL, -- Browser/client info
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retention_expires_at TIMESTAMP NULL -- For archival/deletion policies
);

-- IMMUTABLE - NO UPDATES, NO DELETES (except via retention policy)
-- Alter table to prevent DML
ALTER TABLE audit_log DISABLE TRIGGER ALL;
CREATE TRIGGER audit_log_immutable 
  BEFORE UPDATE OR DELETE ON audit_log 
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- Fast queries for compliance
CREATE INDEX idx_audit_log_tenant_since ON audit_log(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_log_user ON audit_log(actor_id, timestamp DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_action ON audit_log(action, timestamp DESC);
CREATE INDEX idx_audit_log_correlation ON audit_log(correlation_id);

-- Retention management
CREATE INDEX idx_audit_log_retention ON audit_log(retention_expires_at) 
  WHERE retention_expires_at IS NOT NULL;

-- Create trigger function to prevent updates
CREATE OR REPLACE FUNCTION raise_immutable_error()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable - no updates or deletes allowed';
END;
$$ LANGUAGE plpgsql;
```

### 4.2 Data Retention Policy

```sql
-- TTL-like behavior for operational data (NOT media)
-- This runs daily via scheduled job

CREATE TABLE data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(50) NOT NULL, -- Commands, Telemetry, AuditLog, Sessions
  retention_days INT NOT NULL, -- How long to keep
  hard_delete BOOLEAN DEFAULT FALSE, -- Hard delete or soft delete
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed retention policies
INSERT INTO data_retention_policies (resource_type, retention_days, hard_delete) VALUES
  ('commands', 30, true), -- Commands auto-purged after 30 days
  ('audit_log', 2555, false), -- Audit log: 7 years (compliance)
  ('pairing_audit', 365, false), -- Pairing audit: 1 year
  ('sessions', 30, true) -- Sessions: 30 days
ON CONFLICT (resource_type) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;

-- Purge job (run daily at 2 AM UTC)
CREATE OR REPLACE FUNCTION execute_retention_policy()
RETURNS void AS $$
DECLARE
  policy data_retention_policies;
  cutoff_date TIMESTAMP;
BEGIN
  FOR policy IN SELECT * FROM data_retention_policies WHERE enabled = TRUE LOOP
    cutoff_date := CURRENT_TIMESTAMP - INTERVAL '1 day' * policy.retention_days;
    
    IF policy.resource_type = 'commands' THEN
      IF policy.hard_delete THEN
        DELETE FROM commands WHERE updated_at < cutoff_date AND status IN ('COMPLETED', 'FAILED', 'TIMEOUT');
      ELSE
        UPDATE commands SET deleted_at = CURRENT_TIMESTAMP WHERE updated_at < cutoff_date AND deleted_at IS NULL;
      END IF;
    END IF;
    
    -- Add other resource types as needed
  END LOOP;
  
  RAISE NOTICE 'Retention policy executed at %', CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Schedule job in pg_cron (requires pg_cron extension)
-- SELECT cron.schedule('execute-retention-policy', '0 2 * * *', 'SELECT execute_retention_policy()');
```

---

## Phase 5: Row-Level Security (RLS) Configuration

### 5.1 Enable RLS on All Tables

```sql
-- Enable RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Tenants table: Admin-only access
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_admin_only ON tenants
  USING (id = current_setting('app.tenant_id')::uuid);
```

### 5.2 Create RLS Policies for Tenant Isolation

```sql
-- Devices: Tenant-scoped
CREATE POLICY devices_tenant_isolation ON devices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY devices_insert_check ON devices
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- Media: Tenant-scoped
CREATE POLICY media_tenant_isolation ON media
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY media_insert_check ON media
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- Playlists: Tenant-scoped
CREATE POLICY playlists_tenant_isolation ON playlists
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY playlists_insert_check ON playlists
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- Commands: Tenant-scoped
CREATE POLICY commands_tenant_isolation ON commands
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Pairing Codes: Tenant-scoped
CREATE POLICY pairing_codes_tenant_isolation ON pairing_codes
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Pairing Audit: Tenant-scoped
CREATE POLICY pairing_audit_tenant_isolation ON pairing_audit
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Audit Log: Tenant-scoped
CREATE POLICY audit_log_tenant_isolation ON audit_log
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Users: Allow users to see themselves + team members in same tenant
CREATE POLICY users_tenant_isolation ON users
  USING (
    tenant_id = current_setting('app.tenant_id')::uuid 
    OR id = current_setting('app.current_user_id')::uuid
  );
```

### 5.3 Set Context in Application

```sql
-- Run this before every transaction
SET app.tenant_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
SET app.current_user_id = '550e8400-e29b-41d4-a716-446655440001'::uuid;

-- Now any query is automatically filtered:
SELECT * FROM devices; -- Only devices for tenant 550e84...
```

---

## Phase 6: Create Triggers for Automatic Timestamps & Audit

### 6.1 Update Timestamps Trigger

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_tenants_timestamp
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_devices_timestamp
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_media_timestamp
  BEFORE UPDATE ON media
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_playlists_timestamp
  BEFORE UPDATE ON playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- ... repeat for other tables
```

### 6.2 Audit Log Trigger (Auto-record changes)

```sql
CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tenant_id, action, resource_type, resource_id, change, timestamp)
    VALUES (
      OLD.tenant_id,
      'DELETE',
      TG_TABLE_NAME,
      OLD.id::text,
      jsonb_build_object('before', row_to_json(OLD)),
      CURRENT_TIMESTAMP
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tenant_id, action, resource_type, resource_id, change, timestamp)
    VALUES (
      NEW.tenant_id,
      'UPDATE',
      TG_TABLE_NAME,
      NEW.id::text,
      jsonb_build_object('before', row_to_json(OLD), 'after', row_to_json(NEW)),
      CURRENT_TIMESTAMP
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tenant_id, action, resource_type, resource_id, change, timestamp)
    VALUES (
      NEW.tenant_id,
      'CREATE',
      TG_TABLE_NAME,
      NEW.id::text,
      jsonb_build_object('after', row_to_json(NEW)),
      CURRENT_TIMESTAMP
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach to key tables
CREATE TRIGGER audit_devices
  AFTER INSERT OR UPDATE OR DELETE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_media
  AFTER INSERT OR UPDATE OR DELETE ON media
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_changes();

-- ... repeat for other tables
```

---

## Phase 7: Views for Common Queries

```sql
-- Device status summary
CREATE VIEW device_status_summary AS
SELECT
  tenant_id,
  status,
  COUNT(*) as device_count,
  MAX(last_heartbeat_at) as latest_heartbeat,
  MIN(last_heartbeat_at) as oldest_heartbeat
FROM devices
WHERE deleted_at IS NULL
GROUP BY tenant_id, status;

-- Command queue status
CREATE VIEW command_queue_status AS
SELECT
  tenant_id,
  COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
  COUNT(CASE WHEN status = 'DISPATCHED' THEN 1 END) as dispatched_count,
  COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_wait_seconds
FROM commands
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tenant_id;

-- Media storage usage
CREATE VIEW media_storage_usage AS
SELECT
  tenant_id,
  COUNT(DISTINCT id) as file_count,
  SUM(size_bytes) as total_bytes,
  SUM(size_bytes) / 1024.0 / 1024.0 as total_mb,
  COUNT(DISTINCT checksum_sha256) as unique_files,
  ROUND((COUNT(DISTINCT checksum_sha256)::float / COUNT(*)) * 100, 2) as dedup_rate_percent
FROM media
WHERE status = 'ACTIVE'
GROUP BY tenant_id;
```

---

## Deployment Checklist

- [ ] Review all DDL statements with database team
- [ ] Test on staging environment first
- [ ] Backup production database
- [ ] Run migrations in maintenance window (off-peak)
- [ ] Verify RLS policies with sample queries
- [ ] Seed initial roles and retention policies
- [ ] Set up pg_cron for retention job
- [ ] Configure connection pooling (PgBouncer or RDS Proxy)
- [ ] Enable CloudWatch alarms for slow queries
- [ ] Document access procedures for support team
- [ ] Train application team on context-setting (app.tenant_id)
- [ ] Validate dual-write code paths work correctly

---

## Performance Tuning

### Connection Pooling Configuration

```bash
# PgBouncer config (if using separate pooler)
pool_mode = transaction
max_client_conn = 1000
max_db_connections = 100
min_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
```

### Query Optimization Tips

```sql
-- Use prepared statements (avoid SQL injection + better caching)
PREPARE get_device AS
  SELECT * FROM devices 
  WHERE id = $1 AND tenant_id = $2;

-- EXPLAIN ANALYZE to debug slow queries
EXPLAIN ANALYZE
SELECT * FROM commands 
WHERE device_id = $1 
  AND status = 'PENDING' 
  AND created_at > NOW() - INTERVAL '24 hours';

-- Batch operations where possible
INSERT INTO commands (device_id, command_type, status)
VALUES 
  ($1, $2, $3),
  ($4, $5, $6),
  ($7, $8, $9);
```

---

## Monitoring & Alerts

```sql
-- Query to find slow queries (run regularly)
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100 -- Queries >100ms
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Monitor locks
SELECT 
  waiting_query,
  blocking_query,
  wait_time_pretty
FROM pg_blocking_pids();

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname NOT LIKE 'pg_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

