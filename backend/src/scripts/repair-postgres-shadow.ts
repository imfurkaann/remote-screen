

import { getEnv } from "../config/env.js";
import { normalizePlaylistName } from "../lib/playlist-policy.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";
import { commandRepository } from "../repositories/command.repository.js";
import { contentRepository } from "../repositories/content.repository.js";
import { deviceRepository } from "../repositories/device.repository.js";
import { syncUserToPostgres } from "../services/account-lifecycle.service.js";

const BATCH_SIZE = 250;

function requireTenantId(): string {
  const tenantId = String(process.env.CHECK_TENANT_ID ?? "").trim();
  if (!tenantId) throw new Error("CHECK_TENANT_ID is required");
  return tenantId;
}

async function forEachBatch<T>(
  cursor: AsyncIterable<T>,
  handler: (documents: T[]) => Promise<void>
): Promise<number> {
  let batch: T[] = [];
  let processed = 0;
  for await (const document of cursor) {
    batch.push(document);
    if (batch.length < BATCH_SIZE) continue;
    await handler(batch);
    processed += batch.length;
    batch = [];
  }
  if (batch.length > 0) {
    await handler(batch);
    processed += batch.length;
  }
  return processed;
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--confirm-shadow-repair")) {
    throw new Error("SHADOW_REPAIR_CONFIRMATION_REQUIRED: pass --apply --confirm-shadow-repair");
  }

  const env = getEnv();
  const tenantId = requireTenantId();
  if (!env.pgEnabled) throw new Error("PG_ENABLED=true is required");

  await connectMongo(env.mongoUri, {
    maxPoolSize: Math.min(env.mongoMaxPoolSize ?? 100, 30),
    minPoolSize: 0,
    autoIndex: false
  });

  try {
    await connectPostgres(env);
    const tenant = await TenantModel.findById(tenantId).lean();
    if (!tenant) throw new Error("TENANT_NOT_FOUND");

    const mongoCounts = {
      users: await UserModel.countDocuments({ tenantId }),
      devices: await DeviceModel.countDocuments({ tenantId }),
      media: await MediaModel.countDocuments({ tenantId }),
      playlists: await PlaylistModel.countDocuments({ tenantId }),
      commands: await CommandModel.countDocuments({ tenantId })
    };

    if (!apply) {
      console.log(JSON.stringify({ mode: "dry-run", tenantId, mongoCounts }, null, 2));
      return;
    }

    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO tenants (id, name, created_at, updated_at, deleted_at)
       VALUES ($1::uuid, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         updated_at = CURRENT_TIMESTAMP,
         deleted_at = EXCLUDED.deleted_at`,
      [tenantId, tenant.name, tenant.isActive ? null : new Date()]
    );

    const users = await forEachBatch(
      UserModel.find({ tenantId }).select("+passwordHash").cursor(),
      async (documents) => {
        for (let offset = 0; offset < documents.length; offset += 25) {
          await Promise.all(
            documents.slice(offset, offset + 25).map((user) =>
              syncUserToPostgres({
                id: String(user._id),
                tenantId,
                email: user.email,
                passwordHash: user.passwordHash,
                displayName: user.displayName,
                role: user.role,
                isActive: user.isActive
              })
            )
          );
        }
      }
    );

    const devices = await forEachBatch(DeviceModel.find({ tenantId }).cursor(), async (documents) => {
      for (let offset = 0; offset < documents.length; offset += 25) {
        await Promise.all(
          documents.slice(offset, offset + 25).map(async (device) => {
            await deviceRepository.syncPairingRequest({ tenantId, hardwareId: device.hardwareId });
            if (device.pairedOwnerUserId) {
              await deviceRepository.markPairedByHardware({
                tenantId,
                hardwareId: device.hardwareId,
                pairedOwnerUserId: device.pairedOwnerUserId
              });
            }
          })
        );
      }

      const playlistGroups = new Map<string | null, string[]>();
      for (const device of documents) {
        const key = device.currentPlaylistId ?? null;
        const group = playlistGroups.get(key) ?? [];
        group.push(device.hardwareId);
        playlistGroups.set(key, group);
      }
      await Promise.all(
        [...playlistGroups].map(([playlistId, hardwareIds]) =>
          contentRepository.setDevicesCurrentPlaylist(tenantId, hardwareIds, playlistId)
        )
      );
    });

    const media = await forEachBatch(MediaModel.find({ tenantId }).cursor(), async (documents) => {
      await Promise.all(
        documents.map((item) =>
          contentRepository.upsertMedia({
            tenantId,
            externalId: String(item._id),
            filename: item.filename,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
            checksumSha256: item.checksumSha256,
            storagePath: item.storagePath,
            publicUrl: item.publicUrl,
            status: item.status,
            ownerUserId: item.ownerUserId,
            folder: item.folder
          })
        )
      );
    });

    const playlists = await forEachBatch(PlaylistModel.find({ tenantId }).cursor(), async (documents) => {
      await Promise.all(
        documents.map((playlist) =>
          contentRepository.upsertPlaylist({
            tenantId,
            externalId: String(playlist._id),
            name: playlist.name,
            nameKey: playlist.nameKey ?? normalizePlaylistName(playlist.name)?.nameKey ?? playlist.name,
            creationKey: playlist.creationKey,
            version: playlist.version,
            contentChecksumSha256: playlist.contentChecksumSha256,
            itemsJson: playlist.items,
            publishedAt: playlist.publishedAt,
            publishedVersion: playlist.publishedVersion,
            ownerUserId: playlist.ownerUserId
          })
        )
      );
    });

    const commands = await forEachBatch(CommandModel.find({ tenantId }).cursor(), async (documents) => {
      await Promise.all(
        documents.map((command) =>
          commandRepository.upsertShadowCommand({
            tenantId,
            deviceId: command.deviceId,
            requestedByUserId: command.requestedByUserId,
            commandId: command.commandId,
            commandType: command.commandType,
            payload: command.payload,
            status: command.status,
            attempts: command.attempts,
            maxAttempts: command.maxAttempts,
            timeoutMs: command.timeoutMs,
            sentAt: command.sentAt,
            ackAt: command.ackAt,
            completedAt: command.completedAt,
            timeoutAt: command.timeoutAt,
            screenshotUrl: command.screenshotUrl,
            errorMessage: command.errorMessage
          })
        )
      );
    });

    const pgCountsResult = await pool.query<{
      users: string;
      devices: string;
      media: string;
      playlists: string;
      commands: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE tenant_id = $1::uuid AND deleted_at IS NULL)::text AS users,
         (SELECT COUNT(*) FROM devices WHERE tenant_id = $1::uuid AND deleted_at IS NULL)::text AS devices,
         (SELECT COUNT(*) FROM media WHERE tenant_id = $1::uuid AND deleted_at IS NULL)::text AS media,
         (SELECT COUNT(*) FROM playlists WHERE tenant_id = $1::uuid AND deleted_at IS NULL)::text AS playlists,
         (SELECT COUNT(*) FROM commands WHERE tenant_id = $1::uuid AND deleted_at IS NULL)::text AS commands`,
      [tenantId]
    );
    const row = pgCountsResult.rows[0];
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          tenantId,
          processed: { users, devices, media, playlists, commands },
          mongoCounts,
          postgresCounts: row
        },
        null,
        2
      )
    );
  } finally {
    await Promise.allSettled([disconnectMongo(), disconnectPostgres()]);
  }
}

run().catch((error) => {
  console.error("[postgres-shadow-repair] failed", error);
  process.exitCode = 1;
});
