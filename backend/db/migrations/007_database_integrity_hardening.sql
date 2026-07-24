-- Align PostgreSQL shadow constraints with the MongoDB source-of-truth models.

-- The old tenant-wide checksum constraint incorrectly prevented two account
-- owners in the same tenant from storing the same bytes.
DROP INDEX IF EXISTS idx_media_tenant_checksum;
DROP INDEX IF EXISTS idx_media_tenant_owner_checksum_ready;
DROP INDEX IF EXISTS idx_media_tenant_owner_checksum_status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_tenant_owner_checksum_ready_unique
  ON media (tenant_id, owner_user_id, checksum_sha256)
  WHERE deleted_at IS NULL AND status = 'ready' AND owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_tenant_system_checksum_ready_unique
  ON media (tenant_id, checksum_sha256)
  WHERE deleted_at IS NULL AND status = 'ready' AND owner_user_id IS NULL;

DROP INDEX IF EXISTS idx_playlists_tenant_owner_name_active;

ALTER TABLE playlists ADD COLUMN IF NOT EXISTS name_key VARCHAR(255) NULL;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS creation_key VARCHAR(100) NULL;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS content_checksum_sha256 VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS published_version INTEGER NULL;

UPDATE playlists
SET name_key = LOWER(REGEXP_REPLACE(BTRIM(name), '\s+', ' ', 'g'))
WHERE name_key IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_tenant_owner_name_key_active_unique
  ON playlists (tenant_id, COALESCE(owner_user_id, ''), name_key)
  WHERE deleted_at IS NULL AND name_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_tenant_owner_creation_key_active_unique
  ON playlists (tenant_id, COALESCE(owner_user_id, ''), creation_key)
  WHERE deleted_at IS NULL AND creation_key IS NOT NULL;

ALTER TABLE commands ADD COLUMN IF NOT EXISTS requested_by_user_id VARCHAR(64) NULL;

-- MongoDB login identity is globally unique, so the shadow schema must enforce
-- the same rule instead of allowing the same active email in another tenant.
DROP INDEX IF EXISTS idx_users_email_per_tenant;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active_unique
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

-- Global hardware identity supersedes the older tenant-scoped unique index.
DROP INDEX IF EXISTS idx_devices_tenant_hardware;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_tenant
  ON users (id, tenant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_owner_same_tenant_fk') THEN
    ALTER TABLE devices
      ADD CONSTRAINT devices_owner_same_tenant_fk
      FOREIGN KEY (paired_owner_user_id, tenant_id)
      REFERENCES users (id, tenant_id)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('super_admin', 'tenant_owner', 'tenant_admin', 'operator', 'viewer')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_status_check') THEN
    ALTER TABLE devices ADD CONSTRAINT devices_status_check
      CHECK (status IN ('online', 'offline', 'degraded')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_status_check') THEN
    ALTER TABLE media ADD CONSTRAINT media_status_check
      CHECK (status IN ('ready', 'failed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_size_check') THEN
    ALTER TABLE media ADD CONSTRAINT media_size_check CHECK (size_bytes >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_checksum_check') THEN
    ALTER TABLE media ADD CONSTRAINT media_checksum_check
      CHECK (checksum_sha256 ~ '^[0-9a-fA-F]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playlists_version_check') THEN
    ALTER TABLE playlists ADD CONSTRAINT playlists_version_check CHECK (version >= 1) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playlists_items_array_check') THEN
    ALTER TABLE playlists ADD CONSTRAINT playlists_items_array_check
      CHECK (jsonb_typeof(items_json) = 'array') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commands_status_check') THEN
    ALTER TABLE commands ADD CONSTRAINT commands_status_check
      CHECK (status IN ('queued', 'sent', 'acknowledged', 'completed', 'failed', 'timeout')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commands_attempts_check') THEN
    ALTER TABLE commands ADD CONSTRAINT commands_attempts_check
      CHECK (attempts >= 0 AND max_attempts >= 1 AND attempts <= max_attempts AND timeout_ms BETWEEN 1000 AND 300000) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commands_tenant_device_created_active
  ON commands (tenant_id, device_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commands_status_timeout_active
  ON commands (status, timeout_at)
  WHERE deleted_at IS NULL AND status IN ('sent', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_media_tenant_owner_updated_active
  ON media (tenant_id, owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- WITH CHECK closes the write side of the RLS policies. The application still
-- carries explicit tenant predicates; RLS remains defense in depth.
DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS devices_tenant_isolation ON devices;
CREATE POLICY devices_tenant_isolation ON devices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS media_tenant_isolation ON media;
CREATE POLICY media_tenant_isolation ON media
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS playlists_tenant_isolation ON playlists;
CREATE POLICY playlists_tenant_isolation ON playlists
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS commands_tenant_isolation ON commands;
CREATE POLICY commands_tenant_isolation ON commands
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
