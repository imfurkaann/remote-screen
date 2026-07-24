import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { normalizePlaylistName, playlistContentChecksum } from "../lib/playlist-policy.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";

async function run(): Promise<void> {
  const env = getEnv();
  await connectMongo(env.mongoUri, {
    maxPoolSize: env.mongoMaxPoolSize ?? 100,
    minPoolSize: env.mongoMinPoolSize ?? 5,
    autoIndex: false
  });

  const duplicateMedia = await MediaModel.aggregate<{ _id: unknown; count: number }>([
    { $match: { status: "ready" } },
    {
      $group: {
        _id: { tenantId: "$tenantId", ownerUserId: "$ownerUserId", checksum: "$checksumSha256" },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 }
  ]);
  if (duplicateMedia.length > 0) {
    throw new Error(`Duplicate ready media records must be resolved before migration (${duplicateMedia.length} group(s) found)`);
  }

  const playlists = await PlaylistModel.find({})
    .select({ tenantId: 1, ownerUserId: 1, name: 1, version: 1, items: 1, publishedAt: 1 })
    .lean();
  const uniqueNames = new Set<string>();
  const updates = playlists.map((playlist) => {
    const normalized = normalizePlaylistName(playlist.name);
    if (!normalized) throw new Error(`Invalid playlist name: ${playlist._id}`);
    const uniquenessKey = `${playlist.tenantId}:${playlist.ownerUserId ?? "shared"}:${normalized.nameKey}`;
    if (uniqueNames.has(uniquenessKey)) {
      throw new Error(`Duplicate playlist name must be resolved before migration: ${normalized.name}`);
    }
    uniqueNames.add(uniquenessKey);
    return {
      updateOne: {
        filter: { _id: playlist._id },
        update: {
          $set: {
            name: normalized.name,
            nameKey: normalized.nameKey,
            contentChecksumSha256: playlistContentChecksum(playlist.items),
            publishedVersion: playlist.publishedAt ? playlist.version : null
          }
        }
      }
    };
  });

  if (updates.length > 0) await PlaylistModel.bulkWrite(updates, { ordered: true });
  await Promise.all([MediaModel.createIndexes(), PlaylistModel.createIndexes()]);
  console.log(`[content-storage-migration] normalized ${playlists.length} playlist(s) and ensured media/playlist indexes`);
}

run()
  .catch((error) => {
    console.error("[content-storage-migration] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMongo();
  });
