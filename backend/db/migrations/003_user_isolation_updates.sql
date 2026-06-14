ALTER TABLE media ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS folder VARCHAR(255) DEFAULT NULL;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(64) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_media_owner_user_id ON media(owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_playlists_owner_user_id ON playlists(owner_user_id) WHERE deleted_at IS NULL;
