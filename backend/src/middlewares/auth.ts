import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type JwtClaims = {
  sub: string;
  tenant_id: string;
  role: string;
};

type JwtValidationOptions = {
  issuer: string;
  audience: string;
};

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

      const { Types } = await import("mongoose");
      const { UserModel } = await import("../models/user.model.js");

      if (Types.ObjectId.isValid(decoded.sub)) {
        const user = await UserModel.findById(decoded.sub).lean();
        if (!user) {
          res.status(401).json({ code: "UNAUTHORIZED", message: "User account not found" });
          return;
        }
        if (!user.isActive) {
          res.status(401).json({ code: "DEACTIVATED", message: "User account has been deactivated" });
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
    } catch {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid token" });
    }
  };
}

export function requireBootstrapKey(bootstrapKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.header("x-device-bootstrap-key") ?? req.header("x-bootstrap-key");
    if (!key || key !== bootstrapKey) {
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
