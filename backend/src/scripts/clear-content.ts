import { getEnv } from "../config/env.js";
import { assertDestructiveMaintenanceAllowed } from "../lib/maintenance-safety.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";

async function run(): Promise<void> {
  assertDestructiveMaintenanceAllowed("clear-content");
  console.log("[clear-content] Starting database cleanup...");
  
  const env = getEnv();
  
  // 1. Connect MongoDB
  await connectMongo(env.mongoUri);
  console.log("[clear-content] Connected to MongoDB.");

  // 2. Clear MongoDB
  const mediaDeleteRes = await MediaModel.deleteMany({});
  console.log(`[clear-content] MongoDB: Deleted ${mediaDeleteRes.deletedCount} media documents.`);
  
  const playlistDeleteRes = await PlaylistModel.deleteMany({});
  console.log(`[clear-content] MongoDB: Deleted ${playlistDeleteRes.deletedCount} playlist documents.`);
  
  const deviceUpdateRes = await DeviceModel.updateMany({}, {
    $set: { currentPlaylistId: null, currentMediaId: null, playbackStartedAt: null }
  });
  console.log(`[clear-content] MongoDB: Reset current playlist on ${deviceUpdateRes.modifiedCount} devices.`);

  // 3. Clear PostgreSQL if enabled
  if (env.pgEnabled) {
    await connectPostgres(env);
    console.log("[clear-content] Connected to PostgreSQL.");
    const pool = getPostgresPool();
    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");
      
      const mediaPg = await client.query("DELETE FROM media");
      console.log(`[clear-content] PostgreSQL: Deleted ${mediaPg.rowCount ?? 0} media rows.`);
      
      const playlistsPg = await client.query("DELETE FROM playlists");
      console.log(`[clear-content] PostgreSQL: Deleted ${playlistsPg.rowCount ?? 0} playlist rows.`);
      
      const devicesPg = await client.query("UPDATE devices SET current_playlist_id = NULL");
      console.log(`[clear-content] PostgreSQL: Reset current playlist on ${devicesPg.rowCount ?? 0} devices.`);
      
      await client.query("COMMIT");
      console.log("[clear-content] PostgreSQL transaction committed successfully.");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[clear-content] PostgreSQL transaction rolled back due to error:", err);
      throw err;
    } finally {
      client.release();
      await disconnectPostgres();
    }
  } else {
    console.log("[clear-content] PostgreSQL is disabled, skipping PostgreSQL cleanup.");
  }

  // 4. Disconnect MongoDB
  await disconnectMongo();
  console.log("[clear-content] MongoDB disconnected.");
  console.log("[clear-content] Database cleanup completed successfully!");
}

run().catch((error) => {
  console.error("[clear-content] Cleanup failed:", error);
  process.exit(1);
});
