import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
import { CommandModel } from "../models/command.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";

function requireTenantId(): string {
  const tenantId = process.env.CHECK_TENANT_ID;
  if (!tenantId) {
    throw new Error("CHECK_TENANT_ID env var is required for consistency check");
  }
  return tenantId;
}

async function run(): Promise<void> {
  const env = getEnv();
  const tenantId = requireTenantId();

  if (!env.pgEnabled) {
    throw new Error("PG_ENABLED=true olmalı");
  }

  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  const pool = getPostgresPool();

  const [mongoMedia, mongoPlaylists, mongoCommands] = await Promise.all([
    MediaModel.countDocuments({ tenantId }),
    PlaylistModel.countDocuments({ tenantId }),
    CommandModel.countDocuments({ tenantId })
  ]);

  const pgMediaRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM media WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
    [tenantId]
  );
  const pgPlaylistsRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM playlists WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
    [tenantId]
  );
  const pgCommandsRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM commands WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
    [tenantId]
  );

  const pgMedia = Number(pgMediaRes.rows[0]?.count ?? 0);
  const pgPlaylists = Number(pgPlaylistsRes.rows[0]?.count ?? 0);
  const pgCommands = Number(pgCommandsRes.rows[0]?.count ?? 0);

  const report = {
    tenant_id: tenantId,
    media: { mongo: mongoMedia, postgres: pgMedia, matched: mongoMedia === pgMedia },
    playlists: { mongo: mongoPlaylists, postgres: pgPlaylists, matched: mongoPlaylists === pgPlaylists },
    commands: { mongo: mongoCommands, postgres: pgCommands, matched: mongoCommands === pgCommands }
  };

  console.log(JSON.stringify(report, null, 2));

  const isMatched = report.media.matched && report.playlists.matched && report.commands.matched;
  if (!isMatched) {
    process.exitCode = 2;
  }

  await disconnectMongo();
  await disconnectPostgres();
}

run().catch(async (error) => {
  console.error("[check-shadow-consistency] failed", error);
  try {
    await disconnectMongo();
    await disconnectPostgres();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
