import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { UserModel } from "../models/user.model.js";
import { DeviceModel } from "../models/device.model.js";
import { isTenantActive } from "../lib/tenant-state.js";

type JwtClaims = {
  sub: string;
  tenant_id: string;
  role: string;
  hardware_id?: string;
};

type JwtValidationOptions = {
  issuer: string;
  audience: string;
};

function secretMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
function parseBearerToken(authorization?: string): string | null {
  if (!authorization) {
    return null;
  }
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

export function requireUserAuth(jwtSecret: string, options: JwtValidationOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = parseBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing bearer token" });
        return;
      }

      const decoded = jwt.verify(token, jwtSecret, {
        issuer: options.issuer,
        audience: options.audience
      }) as JwtClaims;

      if (!decoded.sub || !decoded.tenant_id || !decoded.role) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid token claims" });
        return;
      }


      if (Types.ObjectId.isValid(decoded.sub)) {
        const [user, activeTenant] = await Promise.all([
          UserModel.findById(decoded.sub)
            .select({ tenantId: 1, role: 1, isActive: 1 })
            .lean(),
          decoded.role === "super_admin"
            ? Promise.resolve(true)
            : isTenantActive(decoded.tenant_id)
        ]);
        if (!user) {
          res.status(401).json({ code: "UNAUTHORIZED", message: "User account not found" });
          return;
        }
        if (!user.isActive) {
          res.status(401).json({ code: "DEACTIVATED", message: "User account has been deactivated" });
          return;
        }
        if (!activeTenant) {
          res.status(403).json({ code: "TENANT_INACTIVE", message: "Organization account is inactive" });
          return;
        }
        if (user.tenantId !== decoded.tenant_id || user.role !== decoded.role) {
          res.status(401).json({ code: "STALE_SESSION", message: "Session claims are no longer current" });
          return;
        }
      } else {
        // Enforce database user lookup in production env. In dev/test, allow legacy/mock string IDs.
        if (process.env.NODE_ENV === "production") {
          res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid user identifier format" });
          return;
        }
      }

      let tenantId = decoded.tenant_id;
      if (decoded.role === "super_admin") {
        const queryTenant = req.query.tenant_id;
        const headerTenant = req.headers["x-tenant-id"];
        if (typeof queryTenant === "string" && queryTenant.trim()) {
          tenantId = queryTenant.trim();
        } else if (typeof headerTenant === "string" && headerTenant.trim()) {
          tenantId = headerTenant.trim();
        }
      }

      req.auth = {
        userId: decoded.sub,
        tenantId,
        role: decoded.role
      };

      next();
    } catch (error) {
      if (!(error instanceof jwt.JsonWebTokenError)) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error("[auth] user token validation failed", detail);
      }
      res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid token" });
    }
  };
}

export function requireDeviceAuth(jwtSecret: string, options: JwtValidationOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = parseBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ code: "DEVICE_UNAUTHORIZED", message: "Missing device bearer token" });
        return;
      }

      const decoded = jwt.verify(token, jwtSecret, {
        issuer: options.issuer,
        audience: options.audience
      }) as JwtClaims;

      if (decoded.role !== "device" || !decoded.sub || !decoded.tenant_id || !decoded.hardware_id) {
        res.status(401).json({ code: "DEVICE_UNAUTHORIZED", message: "Invalid device token claims" });
        return;
      }

      const [device, activeTenant] = await Promise.all([
        DeviceModel.findOne({
          _id: decoded.sub,
          tenantId: decoded.tenant_id,
          hardwareId: decoded.hardware_id,
          pairedOwnerUserId: { $ne: null }
        }).select({ _id: 1, tenantId: 1, hardwareId: 1 }).lean(),
        isTenantActive(decoded.tenant_id)
      ]);

      if (!device || !activeTenant) {
        res.status(401).json({ code: "DEVICE_UNAUTHORIZED", message: "Device is not active or paired" });
        return;
      }

      req.auth = {
        userId: String(device._id),
        tenantId: String(device.tenantId),
        role: "device",
        hardwareId: device.hardwareId
      };
      next();
    } catch {
      res.status(401).json({ code: "DEVICE_UNAUTHORIZED", message: "Invalid device token" });
    }
  };
}

export function requireUserOrDeviceAuth(jwtSecret: string, options: JwtValidationOptions) {
  const userAuth = requireUserAuth(jwtSecret, options);
  const deviceAuth = requireDeviceAuth(jwtSecret, options);

  return (req: Request, res: Response, next: NextFunction): void => {
    const token = parseBearerToken(req.headers.authorization);
    const decoded = token ? jwt.decode(token) as JwtClaims | null : null;
    if (decoded?.role === "device") {
      void deviceAuth(req, res, next);
      return;
    }
    void userAuth(req, res, next);
  };
}

export function requireBootstrapKey(bootstrapKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.header("x-device-bootstrap-key") ?? req.header("x-bootstrap-key");
    if (!key || !secretMatches(key, bootstrapKey)) {
      res.status(401).json({ code: "BOOTSTRAP_UNAUTHORIZED", message: "Invalid bootstrap key" });
      return;
    }
    next();
  };
}

export function requireRoles(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || (!roles.includes(req.auth.role) && req.auth.role !== "super_admin")) {
      res.status(403).json({ code: "FORBIDDEN", message: "Insufficient role" });
      return;
    }
    next();
  };
}
