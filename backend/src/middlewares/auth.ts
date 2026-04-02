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
  return (req: Request, res: Response, next: NextFunction): void => {
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

      req.auth = {
        userId: decoded.sub,
        tenantId: decoded.tenant_id,
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
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Insufficient role" });
      return;
    }
    next();
  };
}
