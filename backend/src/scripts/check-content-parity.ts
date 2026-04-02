import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";

function requireTenantId(): string {
  const tenantId = process.env.CHECK_TENANT_ID;
  if (!tenantId) {
    throw new Error("CHECK_TENANT_ID env var is required for content parity check");
  }
  return tenantId;
}

function getSampleLimit(): number {
  const raw = Number(process.env.CHECK_SAMPLE_LIMIT ?? 50);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 50, 1), 200);
}

async function run(): Promise<void> {
  const env = getEnv();
  const tenantId = requireTenantId();
  const sampleLimit = getSampleLimit();

  if (!env.pgEnabled) {
    throw new Error("PG_ENABLED=true is required");
  }

  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  const pool = getPostgresPool();

  const [mongoMediaCount, mongoPlaylistCount] = await Promise.all([
    MediaModel.countDocuments({ tenantId }),
    PlaylistModel.countDocuments({ tenantId })
  ]);

  const [pgMediaCountRes, pgPlaylistCountRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM media WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
      [tenantId]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM playlists WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
      [tenantId]
    )
  ]);

  const pgMediaCount = Number(pgMediaCountRes.rows[0]?.count ?? 0);
  const pgPlaylistCount = Number(pgPlaylistCountRes.rows[0]?.count ?? 0);

  const [mongoMedia, mongoPlaylists, pgMediaRows, pgPlaylistRows] = await Promise.all([
    MediaModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
    PlaylistModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
    pool.query<{ external_id: string; checksum_sha256: string; status: string }>(
      `SELECT external_id, checksum_sha256, status
       FROM media
       WHERE tenant_id = $1::uuid AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT $2`,
      [tenantId, sampleLimit]
    ),
    pool.query<{ external_id: string; version: number; item_count: number }>(
      `SELECT external_id, version, jsonb_array_length(items_json) AS item_count
       FROM playlists
       WHERE tenant_id = $1::uuid AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT $2`,
      [tenantId, sampleLimit]
    )
  ]);

  const pgMediaByExternalId = new Map(pgMediaRows.rows.map((row) => [row.external_id, row]));
  const pgPlaylistByExternalId = new Map(pgPlaylistRows.rows.map((row) => [row.external_id, row]));

  const mediaMismatches = mongoMedia
    .map((mongo) => {
      const externalId = String((mongo as { _id: unknown })._id);
      const pg = pgMediaByExternalId.get(externalId);
      if (!pg) {
        return { external_id: externalId, reason: "missing_in_postgres" };
      }

      if (pg.checksum_sha256 !== mongo.checksumSha256 || pg.status !== mongo.status) {
        return {
          external_id: externalId,
          reason: "field_mismatch",
          mongo: { checksum_sha256: mongo.checksumSha256, status: mongo.status },
          postgres: { checksum_sha256: pg.checksum_sha256, status: pg.status }
        };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const playlistMismatches = mongoPlaylists
    .map((mongo) => {
      const externalId = String((mongo as { _id: unknown })._id);
      const pg = pgPlaylistByExternalId.get(externalId);
      if (!pg) {
        return { external_id: externalId, reason: "missing_in_postgres" };
      }

      if (pg.version !== mongo.version || pg.item_count !== mongo.items.length) {
        return {
          external_id: externalId,
          reason: "field_mismatch",
          mongo: { version: mongo.version, item_count: mongo.items.length },
          postgres: { version: pg.version, item_count: pg.item_count }
        };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const report = {
    tenant_id: tenantId,
    as_of: new Date().toISOString(),
    sample_limit: sampleLimit,
    counts: {
      media: {
        mongo: mongoMediaCount,
        postgres: pgMediaCount,
        matched: mongoMediaCount === pgMediaCount
      },
      playlists: {
        mongo: mongoPlaylistCount,
        postgres: pgPlaylistCount,
        matched: mongoPlaylistCount === pgPlaylistCount
      }
    },
    sample_diagnostics: {
      media_mismatch_count: mediaMismatches.length,
      playlist_mismatch_count: playlistMismatches.length,
      media_mismatches: mediaMismatches,
      playlist_mismatches: playlistMismatches
    },
    parity_ok:
      mongoMediaCount === pgMediaCount &&
      mongoPlaylistCount === pgPlaylistCount &&
      mediaMismatches.length === 0 &&
      playlistMismatches.length === 0
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.parity_ok) {
    process.exitCode = 2;
  }

  await disconnectMongo();
  await disconnectPostgres();
}

run().catch(async (error) => {
  console.error("[check-content-parity] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  try {
    await disconnectPostgres();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
