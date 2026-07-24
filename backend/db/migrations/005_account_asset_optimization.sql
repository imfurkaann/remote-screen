-- Account, tenant and tenant-owned asset lookup paths.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name_active_unique
  ON tenants (LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_created_active
  ON users (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active
  ON users (tenant_id, role)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_devices_tenant_owner_active
  ON devices (tenant_id, paired_owner_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_tenant_created_ready
  ON media (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'ready';

CREATE INDEX IF NOT EXISTS idx_media_tenant_owner_folder_ready
  ON media (tenant_id, owner_user_id, folder, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'ready';

CREATE INDEX IF NOT EXISTS idx_media_tenant_owner_checksum_ready
  ON media (tenant_id, owner_user_id, checksum_sha256)
  WHERE deleted_at IS NULL AND status = 'ready';

CREATE INDEX IF NOT EXISTS idx_playlists_tenant_owner_updated_active
  ON playlists (tenant_id, owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;