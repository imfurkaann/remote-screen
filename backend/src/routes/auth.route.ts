import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Types } from "mongoose";

import {
  escapeRegex,
  isTenantUserRole,
  normalizeDisplayName,
  normalizeEmail,
  parsePagination,
  validatePassword
} from "../lib/account-policy.js";
import { verifyPassword, hashPassword } from "../lib/bcrypt.js";
import { requireUserAuth, requireRoles } from "../middlewares/auth.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";
import {
  deactivateUserAndTransferAssets,
  syncUserToPostgres
} from "../services/account-lifecycle.service.js";
import { disconnectUserSockets } from "../sockets/registry.js";

type AuthRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

function publicUser(user: any) {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    isActive: user.isActive,
    createdAt: user.createdAt?.toISOString?.() ?? null,
    deactivatedAt: user.deactivatedAt?.toISOString?.() ?? null
  };
}

function syncUserShadow(user: any): void {
  void syncUserToPostgres({
    id: String(user._id),
    tenantId: user.tenantId,
    email: user.email,
    passwordHash: user.passwordHash,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive
  }).catch((error) => console.error("PostgreSQL user shadow sync failed", error));
}

export function buildAuthRouter(deps: AuthRouteDeps): Router {
  const router = Router();
  const authMiddleware = requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience });
  const accountAdminMiddleware = requireRoles(["tenant_owner", "tenant_admin"]);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
  });

  router.post("/login", loginLimiter, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email || !password || password.length > 128) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "A valid email and password are required" });
        return;
      }

      const user = await UserModel.findOne({ email }).select("+passwordHash");
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        return;
      }
      if (!user.isActive) {
        res.status(401).json({ code: "DEACTIVATED", message: "User account has been deactivated" });
        return;
      }

      const tenant = await TenantModel.findOne({ _id: user.tenantId, isActive: true })
        .select({ name: 1 })
        .lean();
      if (!tenant && user.role !== "super_admin") {
        res.status(403).json({ code: "TENANT_INACTIVE", message: "Organization account is inactive" });
        return;
      }

      const userId = user._id.toString();
      const accessToken = jwt.sign(
        {
          sub: userId,
          tenant_id: user.tenantId,
          role: user.role,
          email: user.email,
          tenant_name: tenant?.name ?? user.tenantId
        },
        deps.jwtSecret,
        {
          expiresIn: "8h",
          issuer: deps.jwtIssuer,
          audience: deps.jwtAudience,
          notBefore: "0s"
        }
      );

      res.setHeader("Cache-Control", "no-store");
      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 60 * 60 * 8,
        user: {
          user_id: userId,
          email: user.email,
          tenant_id: user.tenantId,
          role: user.role,
          display_name: user.displayName
        }
      });
    } catch {
      res.status(500).json({ code: "AUTH_FAILED", message: "Internal authentication failure" });
    }
  });

  router.post("/socket-ticket", authMiddleware, async (req, res) => {
    const auth = req.auth!;
    const socketTicket = jwt.sign(
      { sub: auth.userId, tenant_id: auth.tenantId, role: auth.role, scope: "dashboard_socket" },
      deps.jwtSecret,
      {
        expiresIn: "5m",
        issuer: deps.jwtIssuer,
        audience: deps.jwtAudience,
        notBefore: "0s"
      }
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({ ticket: socketTicket, expires_in: 300 });
  });

  router.get("/users", authMiddleware, accountAdminMiddleware, async (req, res) => {
    try {
      const pagination = parsePagination(req.query.page, req.query.limit, { limit: 100, maxLimit: 200 });
      if (!pagination) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid page or limit" });
        return;
      }

      const query: Record<string, unknown> = { tenantId: req.auth!.tenantId };
      const search = String(req.query.search ?? "").trim().slice(0, 120);
      const role = String(req.query.role ?? "").trim();
      const active = String(req.query.active ?? "").trim();
      if (search) {
        const regex = new RegExp(`^${escapeRegex(search)}`, "i");
        query.$or = [{ email: regex }, { displayName: regex }];
      }
      if (role) {
        if (!isTenantUserRole(role)) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid role" });
          return;
        }
        query.role = role;
      }
      if (active) {
        if (active !== "true" && active !== "false") {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "active must be true or false" });
          return;
        }
        query.isActive = active === "true";
      }

      const [total, users] = await Promise.all([
        UserModel.countDocuments(query),
        UserModel.find(query)
          .select({ email: 1, role: 1, displayName: 1, isActive: 1, createdAt: 1, deactivatedAt: 1 })
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .lean()
      ]);
      res.json({
        users: users.map(publicUser),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit))
      });
    } catch {
      res.status(500).json({ code: "FETCH_USERS_FAILED", message: "Failed to fetch users" });
    }
  });

  router.post("/users", authMiddleware, accountAdminMiddleware, async (req, res) => {
    try {
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
      if (req.auth!.role === "tenant_admin" && !["operator", "viewer"].includes(role)) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins can only create operators or viewers" });
        return;
      }

      const tenant = await TenantModel.exists({ _id: req.auth!.tenantId, isActive: true });
      if (!tenant) {
        res.status(409).json({ code: "TENANT_INACTIVE", message: "Organization account is inactive" });
        return;
      }

      const user = await UserModel.create({
        tenantId: req.auth!.tenantId,
        email,
        passwordHash: await hashPassword(password),
        role,
        displayName,
        isActive: true,
        deactivatedAt: null,
        deactivatedByUserId: null
      });
      syncUserShadow(user);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ code: "USER_ALREADY_EXISTS", message: "User with this email already exists" });
        return;
      }
      res.status(500).json({ code: "CREATE_USER_FAILED", message: "Failed to create user" });
    }
  });

  router.put("/users/:userId", authMiddleware, accountAdminMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.userId ?? "");
      if (!Types.ObjectId.isValid(userId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid user id" });
        return;
      }
      const user = await UserModel.findOne({ _id: userId, tenantId: req.auth!.tenantId }).select("+passwordHash");
      if (!user) {
        res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
        return;
      }
      if (req.auth!.role === "tenant_admin" && ["tenant_owner", "tenant_admin"].includes(user.role)) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins cannot modify owners or other admins" });
        return;
      }

      const nextRole = req.body?.role === undefined ? undefined : req.body.role;
      const nextActive = req.body?.isActive === undefined ? undefined : req.body.isActive;
      const nextEmail = req.body?.email === undefined ? undefined : normalizeEmail(req.body.email);
      const nextDisplayName = req.body?.displayName === undefined ? undefined : normalizeDisplayName(req.body.displayName);
      const nextPassword = req.body?.password === undefined || req.body.password === ""
        ? undefined
        : validatePassword(req.body.password);

      if ((nextRole !== undefined && !isTenantUserRole(nextRole)) ||
          (nextActive !== undefined && typeof nextActive !== "boolean") ||
          (req.body?.email !== undefined && !nextEmail) ||
          (req.body?.displayName !== undefined && !nextDisplayName) ||
          (req.body?.password !== undefined && req.body.password !== "" && !nextPassword)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "One or more account fields are invalid" });
        return;
      }
      if (req.auth!.role === "tenant_admin" && nextRole && !["operator", "viewer"].includes(nextRole)) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins cannot elevate account roles" });
        return;
      }
      if (nextActive === false) {
        res.status(409).json({
          code: "USE_DEACTIVATION_ENDPOINT",
          message: "Deactivate accounts through the ownership transfer endpoint"
        });
        return;
      }
      if (userId === req.auth!.userId &&
          (nextRole !== undefined && nextRole !== user.role)) {
        res.status(409).json({ code: "SELF_LOCKOUT_PREVENTED", message: "You cannot deactivate or change your own role" });
        return;
      }
      if (user.role === "tenant_owner" &&
          (nextRole !== undefined && nextRole !== "tenant_owner")) {
        const anotherOwner = await UserModel.exists({
          tenantId: req.auth!.tenantId,
          role: "tenant_owner",
          isActive: true,
          _id: { $ne: user._id }
        });
        if (!anotherOwner) {
          res.status(409).json({ code: "LAST_OWNER_REQUIRED", message: "At least one active tenant owner is required" });
          return;
        }
      }

      if (nextRole !== undefined) user.role = nextRole;
      if (nextActive !== undefined) {
        user.isActive = nextActive;
        user.deactivatedAt = null;
        user.deactivatedByUserId = null;
      }
      if (nextEmail) user.email = nextEmail;
      if (nextDisplayName) user.displayName = nextDisplayName;
      if (nextPassword) user.passwordHash = await hashPassword(nextPassword);
      await user.save();
      syncUserShadow(user);

      if (nextActive !== undefined || nextRole !== undefined || nextPassword !== undefined || nextEmail !== undefined) {
        disconnectUserSockets(userId);
      }
      res.json({ user: publicUser(user) });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ code: "USER_ALREADY_EXISTS", message: "User with this email already exists" });
        return;
      }
      res.status(500).json({ code: "UPDATE_USER_FAILED", message: "Failed to update user" });
    }
  });

  router.delete("/users/:userId", authMiddleware, accountAdminMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.userId ?? "");
      if (!Types.ObjectId.isValid(userId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid user id" });
        return;
      }
      if (userId === req.auth!.userId) {
        res.status(409).json({ code: "SELF_LOCKOUT_PREVENTED", message: "You cannot deactivate your own account" });
        return;
      }

      const user = await UserModel.findOne({ _id: userId, tenantId: req.auth!.tenantId, isActive: true }).lean();
      if (!user) {
        res.status(404).json({ code: "USER_NOT_FOUND", message: "Active user not found" });
        return;
      }
      if (req.auth!.role === "tenant_admin" && ["tenant_owner", "tenant_admin"].includes(user.role)) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins cannot deactivate owners or admins" });
        return;
      }
      if (user.role === "tenant_owner") {
        const anotherOwner = await UserModel.exists({
          tenantId: req.auth!.tenantId,
          role: "tenant_owner",
          isActive: true,
          _id: { $ne: user._id }
        });
        if (!anotherOwner) {
          res.status(409).json({ code: "LAST_OWNER_REQUIRED", message: "At least one active tenant owner is required" });
          return;
        }
      }

      const requestedTargetId = String(req.query.transfer_to_user_id ?? "").trim();
      if (requestedTargetId && !Types.ObjectId.isValid(requestedTargetId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid transfer target" });
        return;
      }
      const transferTarget = requestedTargetId
        ? await UserModel.findOne({ _id: requestedTargetId, tenantId: req.auth!.tenantId, isActive: true }).lean()
        : await UserModel.findOne({
            tenantId: req.auth!.tenantId,
            role: "tenant_owner",
            isActive: true,
            _id: { $ne: userId }
          }).sort({ createdAt: 1 }).lean();
      if (!transferTarget) {
        res.status(409).json({ code: "TRANSFER_TARGET_REQUIRED", message: "An active tenant owner is required for asset transfer" });
        return;
      }

      const transferred = await deactivateUserAndTransferAssets({
        tenantId: req.auth!.tenantId,
        sourceUserId: userId,
        targetUserId: String(transferTarget._id),
        actorUserId: req.auth!.userId
      });
      disconnectUserSockets(userId);
      res.json({
        success: true,
        deactivated_user_id: userId,
        transferred_to_user_id: String(transferTarget._id),
        transferred
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["USER_NOT_FOUND", "TRANSFER_TARGET_NOT_FOUND", "TRANSFER_TARGET_INVALID"].includes(code)) {
        res.status(409).json({ code, message: "Account ownership transfer could not be completed" });
        return;
      }
      res.status(500).json({ code: "DELETE_USER_FAILED", message: "Failed to deactivate user" });
    }
  });

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    router.post("/dev-token", async (req, res) => {
      try {
        const email = normalizeEmail(req.body?.email);
        const tenantId = String(req.body?.tenant_id ?? "").trim() || "tenant-demo";
        const role = String(req.body?.role ?? "operator").trim() || "operator";
        if (!email) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "A valid email is required" });
          return;
        }
        const userId = `user-${email.replace(/[^a-z0-9]/gi, "-")}`;
        const tenant = await TenantModel.findById(tenantId).select({ name: 1 }).lean();
        const accessToken = jwt.sign(
          { sub: userId, tenant_id: tenantId, role, email, tenant_name: tenant?.name ?? tenantId },
          deps.jwtSecret,
          { expiresIn: "8h", issuer: deps.jwtIssuer, audience: deps.jwtAudience, notBefore: "0s" }
        );
        res.json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 60 * 60 * 8,
          user: { user_id: userId, email, tenant_id: tenantId, role }
        });
      } catch {
        res.status(500).json({ code: "AUTH_TOKEN_ISSUE_FAILED", message: "Failed to issue dev token" });
      }
    });
  }

  return router;
}