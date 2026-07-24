import { randomUUID } from "node:crypto";
import { Router } from "express";

import {
  escapeRegex,
  isTenantUserRole,
  normalizeDisplayName,
  normalizeEmail,
  normalizeTenantName,
  parsePagination,
  validatePassword
} from "../lib/account-policy.js";
import { hashPassword } from "../lib/bcrypt.js";
import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { invalidateTenantState } from "../lib/tenant-state.js";
import { requireUserAuth, requireRoles } from "../middlewares/auth.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";
import { mongoIdToUuid, syncUserToPostgres } from "../services/account-lifecycle.service.js";
import { disconnectTenantSockets } from "../sockets/registry.js";

type SuperRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

async function syncTenantToPostgres(tenantId: string, name: string, isActive = true): Promise<void> {
  if (!isPostgresConnected()) return;
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO tenants (id, name, created_at, updated_at, deleted_at)
     VALUES ($1::uuid, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       updated_at = CURRENT_TIMESTAMP,
       deleted_at = EXCLUDED.deleted_at`,
    [tenantId, name, isActive ? null : new Date()]
  );
}

function countMap(rows: Array<{ _id: string; count: number }>): Map<string, number> {
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

export function buildSuperRouter(deps: SuperRouteDeps): Router {
  const router = Router();
  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));
  router.use(requireRoles(["super_admin"]));

  router.get("/tenants", async (req, res) => {
    try {
      const pagination = parsePagination(req.query.page, req.query.limit, { limit: 50, maxLimit: 200 });
      if (!pagination) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid page or limit" });
        return;
      }
      const query: Record<string, unknown> = {};
      const search = String(req.query.search ?? "").trim().slice(0, 120);
      const active = String(req.query.active ?? "").trim();
      if (search) query.nameKey = { $regex: `^${escapeRegex(search.toLocaleLowerCase("en-US"))}` };
      if (active) {
        if (active !== "true" && active !== "false") {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "active must be true or false" });
          return;
        }
        query.isActive = active === "true";
      }

      const [total, tenants] = await Promise.all([
        TenantModel.countDocuments(query),
        TenantModel.find(query)
          .select({ name: 1, isActive: 1, createdAt: 1 })
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .lean()
      ]);
      const tenantIds = tenants.map((tenant) => String(tenant._id));
      const [userRows, deviceRows, mediaRows] = tenantIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            UserModel.aggregate<{ _id: string; count: number }>([
              { $match: { tenantId: { $in: tenantIds }, isActive: true } },
              { $group: { _id: "$tenantId", count: { $sum: 1 } } }
            ]),
            DeviceModel.aggregate<{ _id: string; count: number }>([
              { $match: { tenantId: { $in: tenantIds } } },
              { $group: { _id: "$tenantId", count: { $sum: 1 } } }
            ]),
            MediaModel.aggregate<{ _id: string; count: number }>([
              { $match: { tenantId: { $in: tenantIds }, status: "ready" } },
              { $group: { _id: "$tenantId", count: { $sum: 1 } } }
            ])
          ] as const);
      const usersByTenant = countMap(userRows);
      const devicesByTenant = countMap(deviceRows);
      const mediaByTenant = countMap(mediaRows);

      res.json({
        tenants: tenants.map((tenant) => ({
          ...tenant,
          stats: {
            activeUsers: usersByTenant.get(String(tenant._id)) ?? 0,
            devices: devicesByTenant.get(String(tenant._id)) ?? 0,
            media: mediaByTenant.get(String(tenant._id)) ?? 0
          }
        })),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit))
      });
    } catch {
      res.status(500).json({ code: "FETCH_TENANTS_FAILED", message: "Failed to fetch tenants" });
    }
  });

  router.post("/tenants", async (req, res) => {
    const normalized = normalizeTenantName(req.body?.name);
    if (!normalized) {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "Tenant name must contain 2-120 characters" });
      return;
    }

    try {
      const existing = await TenantModel.exists({
        $or: [
          { nameKey: normalized.nameKey },
          { name: { $regex: `^${escapeRegex(normalized.name)}$`, $options: "i" } }
        ]
      });
      if (existing) {
        res.status(409).json({ code: "TENANT_ALREADY_EXISTS", message: "An organization with this name already exists" });
        return;
      }
      const tenantId = randomUUID();
      const tenant = await TenantModel.create({
        _id: tenantId,
        name: normalized.name,
        nameKey: normalized.nameKey,
        isActive: true
      });
      try {
        await syncTenantToPostgres(tenantId, normalized.name);
      } catch (error) {
        console.error("PostgreSQL tenant shadow sync failed", error);
      }
      res.status(201).json({ tenant });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ code: "TENANT_ALREADY_EXISTS", message: "An organization with this name already exists" });
        return;
      }
      res.status(500).json({ code: "CREATE_TENANT_FAILED", message: "Failed to create tenant" });
    }
  });

  router.put("/tenants/:tenantId", async (req, res) => {
    try {
      const { tenantId } = req.params;
      const tenant = await TenantModel.findById(tenantId);
      if (!tenant) {
        res.status(404).json({ code: "TENANT_NOT_FOUND", message: "Tenant not found" });
        return;
      }

      const normalizedName = req.body?.name === undefined ? undefined : normalizeTenantName(req.body.name);
      const nextActive = req.body?.isActive;
      if ((req.body?.name !== undefined && !normalizedName) ||
          (nextActive !== undefined && typeof nextActive !== "boolean") ||
          (normalizedName === undefined && nextActive === undefined)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Provide a valid name or boolean isActive value" });
        return;
      }
      if (normalizedName && normalizedName.nameKey !== tenant.nameKey) {
        const duplicate = await TenantModel.exists({
          _id: { $ne: tenantId },
          $or: [
            { nameKey: normalizedName.nameKey },
            { name: { $regex: `^${escapeRegex(normalizedName.name)}$`, $options: "i" } }
          ]
        });
        if (duplicate) {
          res.status(409).json({ code: "TENANT_ALREADY_EXISTS", message: "An organization with this name already exists" });
          return;
        }
        tenant.name = normalizedName.name;
        tenant.nameKey = normalizedName.nameKey;
      }
      if (typeof nextActive === "boolean") tenant.isActive = nextActive;
      await tenant.save();
      invalidateTenantState(tenantId);

      if (nextActive === false) {
        await DeviceModel.updateMany(
          { tenantId, status: { $ne: "offline" } },
          { $set: { status: "offline" } }
        );
        disconnectTenantSockets(tenantId);
      }
      try {
        await syncTenantToPostgres(tenantId, tenant.name, tenant.isActive);
      } catch (error) {
        console.error("PostgreSQL tenant shadow sync failed", error);
      }
      res.json({ tenant });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ code: "TENANT_ALREADY_EXISTS", message: "An organization with this name already exists" });
        return;
      }
      res.status(500).json({ code: "UPDATE_TENANT_FAILED", message: "Failed to update tenant" });
    }
  });
  router.post("/tenants/:tenantId/users", async (req, res) => {
    try {
      const { tenantId } = req.params;
      const email = normalizeEmail(req.body?.email);
      const password = validatePassword(req.body?.password);
      const displayName = normalizeDisplayName(req.body?.displayName);
      const role = req.body?.role;
      if (!email || !password || !displayName || !isTenantUserRole(role)) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Valid email, display name, tenant role and a 12+ character strong password are required"
        });
        return;
      }

      const tenant = await TenantModel.findOne({ _id: tenantId, isActive: true }).select({ _id: 1 }).lean();
      if (!tenant) {
        res.status(404).json({ code: "TENANT_NOT_FOUND", message: "Active tenant not found" });
        return;
      }
      const activeUserExists = await UserModel.exists({ tenantId, isActive: true });
      if (!activeUserExists && role !== "tenant_owner") {
        res.status(409).json({ code: "FIRST_OWNER_REQUIRED", message: "The first tenant user must be a tenant owner" });
        return;
      }

      const user = await UserModel.create({
        tenantId,
        email,
        passwordHash: await hashPassword(password),
        role,
        displayName,
        isActive: true,
        deactivatedAt: null,
        deactivatedByUserId: null
      });
      void syncUserToPostgres({
        id: String(user._id),
        tenantId,
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        role: user.role,
        isActive: true
      }).catch((error) => console.error("PostgreSQL user shadow sync failed", error));

      res.status(201).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          isActive: user.isActive
        }
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ code: "USER_ALREADY_EXISTS", message: "User with this email already exists" });
        return;
      }
      res.status(500).json({ code: "CREATE_USER_FAILED", message: "Failed to create tenant user" });
    }
  });

  router.get("/users", async (req, res) => {
    try {
      const pagination = parsePagination(req.query.page, req.query.limit, { limit: 100, maxLimit: 200 });
      if (!pagination) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid page or limit" });
        return;
      }
      const query: Record<string, unknown> = {};
      const tenantId = String(req.query.tenant_id ?? "").trim();
      const search = String(req.query.search ?? "").trim().slice(0, 120);
      if (tenantId) query.tenantId = tenantId;
      if (search) {
        const regex = new RegExp(`^${escapeRegex(search)}`, "i");
        query.$or = [{ email: regex }, { displayName: regex }];
      }

      const [total, users] = await Promise.all([
        UserModel.countDocuments(query),
        UserModel.find(query)
          .select({ tenantId: 1, email: 1, role: 1, displayName: 1, isActive: 1, createdAt: 1 })
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .lean()
      ]);
      const tenantIds = Array.from(new Set(users.map((user) => user.tenantId)));
      const tenants = await TenantModel.find({ _id: { $in: tenantIds } }).select({ name: 1 }).lean();
      const tenantNames = new Map(tenants.map((tenant) => [String(tenant._id), tenant.name]));
      res.json({
        users: users.map((user) => ({
          id: user._id.toString(),
          tenantId: user.tenantId,
          tenantName: tenantNames.get(user.tenantId) ?? null,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          isActive: user.isActive,
          createdAt: (user as any).createdAt?.toISOString() ?? null
        })),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit))
      });
    } catch {
      res.status(500).json({ code: "FETCH_USERS_FAILED", message: "Failed to fetch users" });
    }
  });

  router.get("/devices", async (req, res) => {
    try {
      const pagination = parsePagination(req.query.page, req.query.limit, { limit: 100, maxLimit: 200 });
      if (!pagination) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid page or limit" });
        return;
      }
      const query: Record<string, unknown> = {};
      const tenantId = String(req.query.tenant_id ?? "").trim();
      const status = String(req.query.status ?? "").trim();
      if (tenantId) query.tenantId = tenantId;
      if (status) {
        if (!["online", "offline", "degraded"].includes(status)) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid device status" });
          return;
        }
        query.status = status;
      }
      const [total, devices] = await Promise.all([
        DeviceModel.countDocuments(query),
        DeviceModel.find(query)
          .select({ tenantId: 1, hardwareId: 1, name: 1, location: 1, status: 1, lastHeartbeatAt: 1, createdAt: 1 })
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .lean()
      ]);
      res.json({
        devices,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit))
      });
    } catch {
      res.status(500).json({ code: "FETCH_DEVICES_FAILED", message: "Failed to fetch devices" });
    }
  });

  router.get("/stats", async (_req, res) => {
    try {
      const [totalTenants, activeTenants, totalUsers, activeUsers, totalDevices, onlineDevices, mediaStats, totalPlaylists] = await Promise.all([
        TenantModel.countDocuments(),
        TenantModel.countDocuments({ isActive: true }),
        UserModel.countDocuments(),
        UserModel.countDocuments({ isActive: true }),
        DeviceModel.countDocuments({ tenantId: { $ne: null } }),
        DeviceModel.countDocuments({ tenantId: { $ne: null }, status: "online" }),
        MediaModel.aggregate<{ _id: null; totalMedia: number; totalStorageBytes: number }>([
          { $match: { status: "ready" } },
          { $group: { _id: null, totalMedia: { $sum: 1 }, totalStorageBytes: { $sum: "$sizeBytes" } } }
        ]),
        PlaylistModel.countDocuments()
      ]);
      res.json({
        stats: {
          totalTenants,
          activeTenants,
          totalUsers,
          activeUsers,
          totalDevices,
          onlineDevices,
          totalMedia: mediaStats[0]?.totalMedia ?? 0,
          totalStorageBytes: mediaStats[0]?.totalStorageBytes ?? 0,
          totalPlaylists
        }
      });
    } catch {
      res.status(500).json({ code: "FETCH_STATS_FAILED", message: "Failed to fetch system stats" });
    }
  });

  return router;
}