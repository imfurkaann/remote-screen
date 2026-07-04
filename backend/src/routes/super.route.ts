import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireUserAuth, requireRoles } from "../middlewares/auth.js";
import { UserModel } from "../models/user.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { DeviceModel } from "../models/device.model.js";
import { hashPassword } from "../lib/bcrypt.js";
import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";

type SuperRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

function mongoIdToUuid(mongoId: string): string {
  if (!mongoId || mongoId.length !== 24) {
    if (mongoId && mongoId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return mongoId;
    }
    return "00000000-0000-0000-0000-000000000000";
  }
  const hex32 = "00000000" + mongoId;
  return `${hex32.substring(0, 8)}-${hex32.substring(8, 12)}-${hex32.substring(12, 16)}-${hex32.substring(16, 20)}-${hex32.substring(20)}`;
}

export function buildSuperRouter(deps: SuperRouteDeps): Router {
  const router = Router();

  // Enforce super_admin authentication for all endpoints
  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));
  router.use(requireRoles(["super_admin"]));

  router.get("/tenants", async (req, res) => {
    try {
      const tenants = await TenantModel.find().sort({ createdAt: -1 });
      res.json({ tenants });
    } catch {
      res.status(500).json({ code: "FETCH_TENANTS_FAILED", message: "Failed to fetch tenants" });
    }
  });

  router.post("/tenants", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name is required" });
        return;
      }
      const tenantId = randomUUID();
      const tenant = await TenantModel.create({ _id: tenantId, name: name.trim(), isActive: true });

      if (isPostgresConnected()) {
        try {
          const pool = getPostgresPool();
          await pool.query(
            `INSERT INTO tenants (id, name, created_at, updated_at) VALUES ($1::uuid, $2, NOW(), NOW())`,
            [tenantId, name.trim()]
          );
        } catch (err) {
          console.error("Postgres tenant write failed", err);
        }
      }

      res.status(201).json({ tenant });
    } catch {
      res.status(500).json({ code: "CREATE_TENANT_FAILED", message: "Failed to create tenant" });
    }
  });

  router.post("/tenants/:tenantId/users", async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { email, password, role, displayName } = req.body;
      if (!email || !password || !role || !displayName) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "email, password, role and displayName are required" });
        return;
      }

      const existing = await UserModel.findOne({ email: email.trim().toLowerCase() });
      if (existing) {
        res.status(400).json({ code: "USER_ALREADY_EXISTS", message: "User with this email already exists" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const user = await UserModel.create({
        tenantId,
        email: email.trim().toLowerCase(),
        passwordHash,
        role,
        displayName: displayName.trim(),
        isActive: true
      });

      if (isPostgresConnected()) {
        try {
          const pool = getPostgresPool();
          await pool.query(
            `INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NOW(), NOW())`,
            [
              mongoIdToUuid(user._id.toString()),
              mongoIdToUuid(tenantId),
              user.email,
              user.passwordHash,
              user.displayName,
              user.role
             ]
          );
        } catch (err) {
          console.error("Postgres user write failed", err);
        }
      }

      res.status(201).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          isActive: user.isActive
        }
      });
    } catch {
      res.status(500).json({ code: "CREATE_USER_FAILED", message: "Failed to create tenant user" });
    }
  });

  router.get("/users", async (req, res) => {
    try {
      const users = await UserModel.find().select("-passwordHash").sort({ createdAt: -1 });
      res.json({
        users: users.map(u => ({
          id: u._id.toString(),
          tenantId: u.tenantId,
          email: u.email,
          role: u.role,
          displayName: u.displayName,
          isActive: u.isActive,
          createdAt: (u as any).createdAt?.toISOString() ?? null
        }))
      });
    } catch {
      res.status(500).json({ code: "FETCH_USERS_FAILED", message: "Failed to fetch users" });
    }
  });

  router.get("/devices", async (req, res) => {
    try {
      const devices = await DeviceModel.find().sort({ createdAt: -1 });
      res.json({ devices });
    } catch {
      res.status(500).json({ code: "FETCH_DEVICES_FAILED", message: "Failed to fetch devices" });
    }
  });

  router.get("/stats", async (req, res) => {
    try {
      const [totalTenants, totalUsers, totalDevices, onlineDevices] = await Promise.all([
        TenantModel.countDocuments(),
        UserModel.countDocuments(),
        DeviceModel.countDocuments(),
        DeviceModel.countDocuments({ status: "online" })
      ]);
      res.json({
        stats: {
          totalTenants,
          totalUsers,
          totalDevices,
          onlineDevices
        }
      });
    } catch {
      res.status(500).json({ code: "FETCH_STATS_FAILED", message: "Failed to fetch system stats" });
    }
  });

  return router;
}
