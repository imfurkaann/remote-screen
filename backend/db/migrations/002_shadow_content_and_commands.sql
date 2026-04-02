CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  external_id VARCHAR(64) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ready',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_tenant_external
  ON media(tenant_id, external_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_tenant_checksum
  ON media(tenant_id, checksum_sha256)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  external_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  items_json JSONB NOT NULL DEFAULT '[]',
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_tenant_external
  ON playlists(tenant_id, external_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id VARCHAR(64) NOT NULL,
  command_id VARCHAR(64) NOT NULL,
  command_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 2,
  timeout_ms INT NOT NULL DEFAULT 15000,
  sent_at TIMESTAMP NULL,
  ack_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  timeout_at TIMESTAMP NULL,
  screenshot_url TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commands_tenant_device_command
  ON commands(tenant_id, device_id, command_id)
  WHERE deleted_at IS NULL;

ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_tenant_isolation ON media;
CREATE POLICY media_tenant_isolation ON media
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS playlists_tenant_isolation ON playlists;
CREATE POLICY playlists_tenant_isolation ON playlists
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS commands_tenant_isolation ON commands;
CREATE POLICY commands_tenant_isolation ON commands
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
