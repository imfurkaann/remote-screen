-- Media/playlist access paths used by paginated account content APIs.
CREATE INDEX IF NOT EXISTS idx_media_tenant_owner_checksum_status
  ON media (tenant_id, owner_user_id, checksum_sha256, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_playlists_tenant_owner_name_active
  ON playlists (tenant_id, owner_user_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_devices_tenant_current_playlist_active
  ON devices (tenant_id, current_playlist_id)
  WHERE deleted_at IS NULL;
