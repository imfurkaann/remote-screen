import { Router } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";
import { DeviceModel } from "../models/device.model.js";
import { verifyPassword, hashPassword } from "../lib/bcrypt.js";
import { requireUserAuth, requireRoles } from "../middlewares/auth.js";
import { disconnectUserSockets } from "../sockets/registry.js";

type AuthRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

export function buildAuthRouter(deps: AuthRouteDeps): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");

      if (!email || !password) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "email and password are required" });
        return;
      }

      const user = await UserModel.findOne({ email });
      if (!user) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        return;
      }

      const isPasswordValid = await verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        return;
      }

      if (!user.isActive) {
        res.status(401).json({ code: "DEACTIVATED", message: "User account has been deactivated" });
        return;
      }

      const userId = user._id.toString();
      const accessToken = jwt.sign(
        {
          sub: userId,
          tenant_id: user.tenantId,
          role: user.role,
          email: user.email
        },
        deps.jwtSecret,
        {
          expiresIn: "8h",
          issuer: deps.jwtIssuer,
          audience: deps.jwtAudience,
          notBefore: "0s"
        }
      );

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

  // User CRUD Operations
  router.get("/users", requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }), requireRoles(["tenant_owner", "tenant_admin"]), async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const users = await UserModel.find({ tenantId }).select("-passwordHash").sort({ createdAt: -1 });
      
      res.json({
        users: users.map(u => ({
          id: u._id.toString(),
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

  router.post("/users", requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }), requireRoles(["tenant_owner", "tenant_admin"]), async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const { email, password, role, displayName } = req.body;
      
      if (!email || !password || !role || !displayName) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "email, password, role, and displayName are required" });
        return;
      }

      if (req.auth?.role === "tenant_admin" && (role === "tenant_owner" || role === "tenant_admin")) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins can only create operators or viewers" });
        return;
      }

      const existingUser = await UserModel.findOne({ email: email.trim().toLowerCase() });
      if (existingUser) {
        res.status(400).json({ code: "USER_ALREADY_EXISTS", message: "User with this email already exists" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const newUser = await UserModel.create({
        tenantId,
        email: email.trim().toLowerCase(),
        passwordHash,
        role,
        displayName: displayName.trim(),
        isActive: true
      });

      res.status(201).json({
        user: {
          id: newUser._id.toString(),
          email: newUser.email,
          role: newUser.role,
          displayName: newUser.displayName,
          isActive: newUser.isActive
        }
      });
    } catch {
      res.status(500).json({ code: "CREATE_USER_FAILED", message: "Failed to create user" });
    }
  });

  router.put("/users/:userId", requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }), requireRoles(["tenant_owner", "tenant_admin"]), async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const { userId } = req.params;
      const { role, displayName, isActive, password } = req.body;

      const user = await UserModel.findOne({ _id: userId, tenantId });
      if (!user) {
        res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
        return;
      }

      if (req.auth?.role === "tenant_admin" && (user.role === "tenant_owner" || user.role === "tenant_admin")) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins cannot modify owners or other admins" });
        return;
      }

      if (req.auth?.role === "tenant_admin" && role && (role === "tenant_owner" || role === "tenant_admin")) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins cannot elevate roles to owner or admin" });
        return;
      }

      const updates: Record<string, any> = {};
      if (role) updates.role = role;
      if (displayName) updates.displayName = displayName.trim();
      if (isActive !== undefined) {
        updates.isActive = isActive;
        if (isActive === false) {
          disconnectUserSockets(userId as string);
        }
      }
      if (password) {
        updates.passwordHash = await hashPassword(password);
      }

      const updatedUser = await UserModel.findOneAndUpdate(
        { _id: userId, tenantId },
        { $set: updates },
        { new: true }
      ).select("-passwordHash");

      if (!updatedUser) {
        res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
        return;
      }

      res.json({
        user: {
          id: updatedUser._id.toString(),
          email: updatedUser.email,
          role: updatedUser.role,
          displayName: updatedUser.displayName,
          isActive: updatedUser.isActive
        }
      });
    } catch {
      res.status(500).json({ code: "UPDATE_USER_FAILED", message: "Failed to update user" });
    }
  });

  router.delete("/users/:userId", requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }), requireRoles(["tenant_owner", "tenant_admin"]), async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const { userId } = req.params;

      const user = await UserModel.findOne({ _id: userId, tenantId });
      if (!user) {
        res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
        return;
      }

      if (req.auth?.role === "tenant_admin" && (user.role === "tenant_owner" || user.role === "tenant_admin")) {
        res.status(403).json({ code: "FORBIDDEN", message: "Admins cannot delete owners or admins" });
        return;
      }

      const owner = await UserModel.findOne({ tenantId, role: "tenant_owner" });
      if (!owner) {
        res.status(500).json({ code: "OWNER_NOT_FOUND", message: "Tenant owner user not found" });
        return;
      }

      await DeviceModel.updateMany(
        { tenantId, pairedOwnerUserId: userId },
        { $set: { pairedOwnerUserId: owner._id.toString() } }
      );

      await UserModel.deleteOne({ _id: userId, tenantId });
      
      disconnectUserSockets(userId as string);

      res.status(204).send();
    } catch {
      res.status(500).json({ code: "DELETE_USER_FAILED", message: "Failed to delete user" });
    }
  });

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    router.post("/dev-token", async (req, res) => {
      try {
        const email = String(req.body?.email ?? "").trim().toLowerCase();
        const tenantId = String(req.body?.tenant_id ?? "").trim() || "tenant-demo";
        const role = String(req.body?.role ?? "operator").trim() || "operator";

        if (!email) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "email is required" });
          return;
        }

        const userId = `user-${email.replace(/[^a-z0-9]/gi, "-")}`;
        const accessToken = jwt.sign(
          {
            sub: userId,
            tenant_id: tenantId,
            role,
            email
          },
          deps.jwtSecret,
          {
            expiresIn: "8h",
            issuer: deps.jwtIssuer,
            audience: deps.jwtAudience,
            notBefore: "0s"
          }
        );

        res.json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 60 * 60 * 8,
          user: {
            user_id: userId,
            email,
            tenant_id: tenantId,
            role
          }
        });
      } catch {
        res.status(500).json({ code: "AUTH_TOKEN_ISSUE_FAILED", message: "Failed to issue dev token" });
      }
    });
  }

  return router;
}
