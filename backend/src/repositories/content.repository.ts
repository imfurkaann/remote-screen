import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { Logger } from "../lib/logger.js";
import { postgresCircuitBreaker } from "../lib/circuit-breaker.js";
import { metrics } from "../lib/metrics.js";
import { withRetry } from "../lib/retry.js";

const logger = new Logger('ContentRepository');

type ShadowMediaInput = {
  tenantId: string;
  externalId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  storagePath: string;
  publicUrl: string;
  status: string;
};

export type ShadowMediaRow = {
  id: string;
  external_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  storage_path: string;
  public_url: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type ShadowPlaylistInput = {
  tenantId: string;
  externalId: string;
  name: string;
  version: number;
  itemsJson: unknown;
  publishedAt: Date | null;
};

export type ShadowPlaylistRow = {
  id: string;
  external_id: string;
  name: string;
  version: number;
  items_json: unknown;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Content repository with shadow write/read resilience
 */
export class ContentRepository {
  /**
   * Upsert media to shadow table with retry logic
   * Non-blocking: failures are logged but do not throw
   */
  async upsertMedia(input: ShadowMediaInput): Promise<void> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, skipping media upsert', {
        operation: 'upsertMedia',
        tenantId: input.tenantId,
        mediaId: input.externalId
      });
      return;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.warn('PostgreSQL circuit breaker is OPEN, skipping media upsert', {
        operation: 'upsertMedia',
        tenantId: input.tenantId,
        mediaId: input.externalId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return;
    }

    try {
      await withRetry(
        () => this.performMediaUpsert(input),
        `media-upsert[${input.externalId}]`,
        { maxRetries: 2, initialDelayMs: 50 }
      );
      postgresCircuitBreaker.recordSuccess();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      logger.error('Failed to upsert media after retries', err, {
        operation: 'upsertMedia',
        tenantId: input.tenantId,
        mediaId: input.externalId,
        sizeBytes: input.sizeBytes,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
    }
  }

  private async performMediaUpsert(input: ShadowMediaInput): Promise<void> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO media (
        tenant_id, external_id, filename, mime_type, size_bytes,
        checksum_sha256, storage_path, public_url, status
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, external_id)
      DO UPDATE SET
        filename = EXCLUDED.filename,
        mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes,
        checksum_sha256 = EXCLUDED.checksum_sha256,
        storage_path = EXCLUDED.storage_path,
        public_url = EXCLUDED.public_url,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP`,
      [
        input.tenantId,
        input.externalId,
        input.filename,
        input.mimeType,
        input.sizeBytes,
        input.checksumSha256,
        input.storagePath,
        input.publicUrl,
        input.status
      ]
    );

    logger.debug('Media upserted to shadow table', {
      operation: 'upsertMedia',
      tenantId: input.tenantId,
      mediaId: input.externalId,
      sizeBytes: input.sizeBytes
    });
  }

  /**
   * Upsert playlist to shadow table with retry logic
   * Non-blocking: failures are logged but do not throw
   */
  async upsertPlaylist(input: ShadowPlaylistInput): Promise<void> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, skipping playlist upsert', {
        operation: 'upsertPlaylist',
        tenantId: input.tenantId,
        playlistId: input.externalId
      });
      return;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.warn('PostgreSQL circuit breaker is OPEN, skipping playlist upsert', {
        operation: 'upsertPlaylist',
        tenantId: input.tenantId,
        playlistId: input.externalId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return;
    }

    try {
      await withRetry(
        () => this.performPlaylistUpsert(input),
        `playlist-upsert[${input.externalId}]`,
        { maxRetries: 2, initialDelayMs: 50 }
      );
      postgresCircuitBreaker.recordSuccess();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      logger.error('Failed to upsert playlist after retries', err, {
        operation: 'upsertPlaylist',
        tenantId: input.tenantId,
        playlistId: input.externalId,
        version: input.version,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
    }
  }

  private async performPlaylistUpsert(input: ShadowPlaylistInput): Promise<void> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO playlists (
        tenant_id, external_id, name, version, items_json, published_at
      )
      VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (tenant_id, external_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        version = EXCLUDED.version,
        items_json = EXCLUDED.items_json,
        published_at = EXCLUDED.published_at,
        updated_at = CURRENT_TIMESTAMP`,
      [
        input.tenantId,
        input.externalId,
        input.name,
        input.version,
        JSON.stringify(input.itemsJson),
        input.publishedAt
      ]
    );

    logger.debug('Playlist upserted to shadow table', {
      operation: 'upsertPlaylist',
      tenantId: input.tenantId,
      playlistId: input.externalId,
      version: input.version,
      published: input.publishedAt !== null
    });
  }

  /**
   * Set devices' current playlist with retry logic
   * Non-blocking: failures are logged but do not throw
   */
  async setDevicesCurrentPlaylist(
    tenantId: string,
    hardwareIds: string[],
    playlistExternalId: string
  ): Promise<void> {
    if (!isPostgresConnected() || hardwareIds.length === 0) {
      logger.debug('Skipping device playlist assignment', {
        operation: 'setDevicesCurrentPlaylist',
        tenantId,
        playlistId: playlistExternalId,
        deviceCount: hardwareIds.length,
        pgConnected: isPostgresConnected()
      });
      return;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.warn('PostgreSQL circuit breaker is OPEN, skipping device playlist assignment', {
        operation: 'setDevicesCurrentPlaylist',
        tenantId,
        playlistId: playlistExternalId,
        deviceCount: hardwareIds.length,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return;
    }

    try {
      await withRetry(
        () => this.performSetDevicesCurrentPlaylist(tenantId, hardwareIds, playlistExternalId),
        `device-playlist-assign[${playlistExternalId}]`,
        { maxRetries: 2, initialDelayMs: 50 }
      );
      postgresCircuitBreaker.recordSuccess();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      logger.error('Failed to assign playlist to devices after retries', err, {
        operation: 'setDevicesCurrentPlaylist',
        tenantId,
        playlistId: playlistExternalId,
        deviceCount: hardwareIds.length,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
    }
  }

  private async performSetDevicesCurrentPlaylist(
    tenantId: string,
    hardwareIds: string[],
    playlistExternalId: string
  ): Promise<void> {
    const pool = getPostgresPool();
    const result = await pool.query(
      `UPDATE devices
       SET current_playlist_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2::uuid
         AND hardware_id = ANY($3::text[])
         AND deleted_at IS NULL`,
      [playlistExternalId, tenantId, hardwareIds]
    );

    logger.debug('Device playlist assignments updated', {
      operation: 'setDevicesCurrentPlaylist',
      tenantId,
      playlistId: playlistExternalId,
      targetDevices: hardwareIds.length,
      updatedDevices: result.rowCount
    });
  }

  /**
   * Fetch media by external ID from shadow table.
   * Returns null on fallback path.
   */
  async getMedia(tenantId: string, mediaId: string): Promise<ShadowMediaRow | null> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, returning null', {
        operation: 'getMedia',
        tenantId,
        mediaId
      });
      return null;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.debug('PostgreSQL circuit breaker is OPEN, returning null', {
        operation: 'getMedia',
        tenantId,
        mediaId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return null;
    }

    const startTime = Date.now();
    try {
      const pool = getPostgresPool();
      const result = await pool.query<ShadowMediaRow>(
        `SELECT id, external_id, filename, mime_type, size_bytes,
                checksum_sha256, storage_path, public_url, status,
                created_at, updated_at
         FROM media
         WHERE tenant_id = $1::uuid
           AND external_id = $2
           AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, mediaId]
      );

      const latencyMs = Date.now() - startTime;
      postgresCircuitBreaker.recordSuccess();
      metrics.recordShadowRead('postgres', latencyMs);

      logger.debug('Media fetched from PostgreSQL', {
        operation: 'getMedia',
        tenantId,
        mediaId,
        found: result.rows.length > 0,
        latencyMs
      });

      return result.rows[0] ?? null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      const latencyMs = Date.now() - startTime;
      metrics.recordShadowRead('mongo', latencyMs, true);

      logger.warn('Failed to fetch media from PostgreSQL, will fallback to MongoDB', {
        operation: 'getMedia',
        tenantId,
        mediaId,
        latencyMs,
        errorMessage: err.message,
        circuitBreakerState: postgresCircuitBreaker.getState()
      }, err);

      return null;
    }
  }

  /**
   * List media from shadow table.
   * Returns empty list on fallback path.
   */
  async listMedia(tenantId: string, limit: number): Promise<ShadowMediaRow[]> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, returning empty list', {
        operation: 'listMedia',
        tenantId,
        limit
      });
      return [];
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.debug('PostgreSQL circuit breaker is OPEN, returning empty list', {
        operation: 'listMedia',
        tenantId,
        limit,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return [];
    }

    const startTime = Date.now();
    try {
      const pool = getPostgresPool();
      const result = await pool.query<ShadowMediaRow>(
        `SELECT id, external_id, filename, mime_type, size_bytes,
                checksum_sha256, storage_path, public_url, status,
                created_at, updated_at
         FROM media
         WHERE tenant_id = $1::uuid
           AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT $2`,
        [tenantId, limit]
      );

      const latencyMs = Date.now() - startTime;
      postgresCircuitBreaker.recordSuccess();
      metrics.recordShadowRead('postgres', latencyMs);

      logger.debug('Media list fetched from PostgreSQL', {
        operation: 'listMedia',
        tenantId,
        count: result.rows.length,
        latencyMs
      });

      return result.rows;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      const latencyMs = Date.now() - startTime;
      metrics.recordShadowRead('mongo', latencyMs, true);

      logger.warn('Failed to list media from PostgreSQL, will fallback to MongoDB', {
        operation: 'listMedia',
        tenantId,
        latencyMs,
        errorMessage: err.message,
        circuitBreakerState: postgresCircuitBreaker.getState()
      }, err);

      return [];
    }
  }

  /**
   * Fetch playlist by external ID from shadow table.
   * Returns null on fallback path.
   */
  async getPlaylist(tenantId: string, playlistId: string): Promise<ShadowPlaylistRow | null> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, returning null', {
        operation: 'getPlaylist',
        tenantId,
        playlistId
      });
      return null;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.debug('PostgreSQL circuit breaker is OPEN, returning null', {
        operation: 'getPlaylist',
        tenantId,
        playlistId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return null;
    }

    const startTime = Date.now();
    try {
      const pool = getPostgresPool();
      const result = await pool.query<ShadowPlaylistRow>(
        `SELECT id, external_id, name, version, items_json,
                published_at, created_at, updated_at
         FROM playlists
         WHERE tenant_id = $1::uuid
           AND external_id = $2
           AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, playlistId]
      );

      const latencyMs = Date.now() - startTime;
      postgresCircuitBreaker.recordSuccess();
      metrics.recordShadowRead('postgres', latencyMs);

      logger.debug('Playlist fetched from PostgreSQL', {
        operation: 'getPlaylist',
        tenantId,
        playlistId,
        found: result.rows.length > 0,
        latencyMs
      });

      return result.rows[0] ?? null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      const latencyMs = Date.now() - startTime;
      metrics.recordShadowRead('mongo', latencyMs, true);

      logger.warn('Failed to fetch playlist from PostgreSQL, will fallback to MongoDB', {
        operation: 'getPlaylist',
        tenantId,
        playlistId,
        latencyMs,
        errorMessage: err.message,
        circuitBreakerState: postgresCircuitBreaker.getState()
      }, err);

      return null;
    }
  }

  /**
   * List playlists from shadow table.
   * Returns empty list on fallback path.
   */
  async listPlaylists(tenantId: string, limit: number): Promise<ShadowPlaylistRow[]> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, returning empty list', {
        operation: 'listPlaylists',
        tenantId,
        limit
      });
      return [];
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.debug('PostgreSQL circuit breaker is OPEN, returning empty list', {
        operation: 'listPlaylists',
        tenantId,
        limit,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return [];
    }

    const startTime = Date.now();
    try {
      const pool = getPostgresPool();
      const result = await pool.query<ShadowPlaylistRow>(
        `SELECT id, external_id, name, version, items_json,
                published_at, created_at, updated_at
         FROM playlists
         WHERE tenant_id = $1::uuid
           AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT $2`,
        [tenantId, limit]
      );

      const latencyMs = Date.now() - startTime;
      postgresCircuitBreaker.recordSuccess();
      metrics.recordShadowRead('postgres', latencyMs);

      logger.debug('Playlists list fetched from PostgreSQL', {
        operation: 'listPlaylists',
        tenantId,
        count: result.rows.length,
        latencyMs
      });

      return result.rows;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      const latencyMs = Date.now() - startTime;
      metrics.recordShadowRead('mongo', latencyMs, true);

      logger.warn('Failed to list playlists from PostgreSQL, will fallback to MongoDB', {
        operation: 'listPlaylists',
        tenantId,
        latencyMs,
        errorMessage: err.message,
        circuitBreakerState: postgresCircuitBreaker.getState()
      }, err);

      return [];
    }
  }
}

export const contentRepository = new ContentRepository();
