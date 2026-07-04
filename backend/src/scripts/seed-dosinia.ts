import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, isPostgresConnected, getPostgresPool } from "../lib/postgres.js";
import { UserModel } from "../models/user.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { CommandModel } from "../models/command.model.js";
import { hashPassword } from "../lib/bcrypt.js";
import { randomUUID } from "node:crypto";
import { getEnv } from "../config/env.js";

async function run() {
  const env = getEnv();
  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  console.log("Clearing MongoDB...");
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DeviceModel.deleteMany({});
  await MediaModel.deleteMany({});
  await PlaylistModel.deleteMany({});
  await CommandModel.deleteMany({});

  if (isPostgresConnected()) {
    console.log("Clearing Postgres...");
    const pool = getPostgresPool();
    await pool.query("DELETE FROM commands");
    await pool.query("DELETE FROM devices");
    await pool.query("DELETE FROM playlists");
    await pool.query("DELETE FROM media");
    await pool.query("DELETE FROM users");
    await pool.query("DELETE FROM tenants");
  }

  const tenantId = randomUUID();
  console.log(`Seeding Tenant "Dosinia Luxury Resort" with ID: ${tenantId}`);

  await TenantModel.create({
    _id: tenantId,
    name: "Dosinia Luxury Resort",
    isActive: true
  });

  const newUser = await UserModel.create({
    tenantId,
    email: "dosinialuxuryresort@remotescreen.dev",
    passwordHash: await hashPassword("dosinia123"),
    role: "tenant_owner",
    displayName: "Dosinia Super User",
    isActive: true
  });
  console.log(`Seeding Super User "dosinialuxuryresort@remotescreen.dev" with password "dosinia123"`);

  if (isPostgresConnected()) {
    console.log("Seeding Postgres shadow tables...");
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
  }

  await disconnectMongo();
  await disconnectPostgres();
  console.log("Seeding done!");
}

run().catch(console.error);
