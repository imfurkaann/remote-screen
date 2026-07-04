import { createServer } from "node:http";

import { buildApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./lib/mongo.js";
import { connectPostgres, disconnectPostgres, isPostgresConnected, getPostgresPool } from "./lib/postgres.js";
import { createSocketServer } from "./sockets/index.js";
import { setSocketServer } from "./sockets/registry.js";

function logProcessError(type: "uncaught_exception" | "unhandled_rejection", error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      type,
      message: err.message,
      stack: err.stack ?? null
    })
  );
}

async function bootstrap(): Promise<void> {
  process.on("uncaughtException", (error) => {
    logProcessError("uncaught_exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    logProcessError("unhandled_rejection", reason);
  });

  const env = getEnv();
  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  if (env.pgEnabled) {
    console.log("[backend] PostgreSQL connection established");
  }

  // Seed default user accounts in MongoDB
  try {
    const { UserModel } = await import("./models/user.model.js");
    const { TenantModel } = await import("./models/tenant.model.js");
    const { DeviceModel } = await import("./models/device.model.js");
    const { MediaModel } = await import("./models/media.model.js");
    const { PlaylistModel } = await import("./models/playlist.model.js");
    const { CommandModel } = await import("./models/command.model.js");
    const { hashPassword } = await import("./lib/bcrypt.js");
    const { randomUUID } = await import("node:crypto");

    const dosiniaTenant = await TenantModel.findOne({ name: "Dosinia Luxury Resort" });
    if (!dosiniaTenant) {
      console.log("[backend] Clearing old database to initialize Dosinia Luxury Resort...");
      
      // Wipe MongoDB collections
      await TenantModel.deleteMany({});
      await UserModel.deleteMany({});
      await DeviceModel.deleteMany({});
      await MediaModel.deleteMany({});
      await PlaylistModel.deleteMany({});
      await CommandModel.deleteMany({});

      // Wipe Postgres if connected
      if (isPostgresConnected()) {
        try {
          const pool = getPostgresPool();
          await pool.query("DELETE FROM commands");
          await pool.query("DELETE FROM devices");
          await pool.query("DELETE FROM playlists");
          await pool.query("DELETE FROM media");
          await pool.query("DELETE FROM users");
          await pool.query("DELETE FROM tenants");
        } catch (err) {
          console.error("[backend] Postgres table wipe failed", err);
        }
      }

      // Seed new Dosinia Luxury Resort tenant
      const tenantId = randomUUID();
      const newTenant = await TenantModel.create({
        _id: tenantId,
        name: "Dosinia Luxury Resort",
        isActive: true
      });

      // Seed Dosinia Luxury Resort tenant super user
      const newUser = await UserModel.create({
        tenantId,
        email: "dosinialuxuryresort@remotescreen.dev",
        passwordHash: await hashPassword("dosinia123"),
        role: "tenant_owner",
        displayName: "Dosinia Super User",
        isActive: true
      });

      // Seed Postgres if connected
      if (isPostgresConnected()) {
        try {
          const pool = getPostgresPool();
          await pool.query(
            `INSERT INTO tenants (id, name, created_at, updated_at) VALUES ($1::uuid, $2, NOW(), NOW())`,
            [tenantId, "Dosinia Luxury Resort"]
          );

          const hex32 = "00000000" + newUser._id.toString();
          const userUuid = `${hex32.substring(0, 8)}-${hex32.substring(8, 12)}-${hex32.substring(12, 16)}-${hex32.substring(16, 20)}-${hex32.substring(20)}`;

          await pool.query(
            `INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NOW(), NOW())`,
            [
              userUuid,
              tenantId,
              newUser.email,
              newUser.passwordHash,
              newUser.displayName,
              newUser.role
            ]
          );
        } catch (err) {
          console.error("[backend] Postgres seeding failed", err);
        }
      }

      console.log("[backend] Seeded Dosinia Luxury Resort and its super user successfully");
    }
  } catch (err) {
    console.error("[backend] Failed to seed default accounts", err);
  }

  // Reset all devices status to offline in MongoDB and PostgreSQL on server boot
  try {
    const { DeviceModel } = await import("./models/device.model.js");
    const { deviceRepository } = await import("./repositories/device.repository.js");

    await DeviceModel.updateMany({}, { $set: { status: "offline" } });
    console.log("[backend] MongoDB device statuses reset to offline");

    if (env.pgEnabled) {
      await deviceRepository.resetAllStatusesToOffline();
    }
  } catch (err) {
    console.error("[backend] Failed to reset device statuses on startup", err);
  }

  const app = buildApp(env);
  const server = createServer(app);
  const io = createSocketServer(server, {
    corsOrigin: env.corsOrigin,
    jwtSecret: env.jwtAccessSecret,
    jwtIssuer: env.jwtIssuer,
    jwtAudience: env.jwtAudience
  });
  setSocketServer(io);

  server.listen(env.port, () => {
    console.log(`[backend] listening on :${env.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await disconnectMongo();
      await disconnectPostgres();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error("[backend] bootstrap failed", error);
  process.exit(1);
});
