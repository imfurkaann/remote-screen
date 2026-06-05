import { Router } from "express";
import jwt from "jsonwebtoken";

type AuthRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

const VALID_USERS = [
  { email: "owner@remotescreen.dev", password: "owner123", role: "tenant_owner" },
  { email: "admin@remotescreen.dev", password: "admin123", role: "tenant_admin" },
  { email: "operator@remotescreen.dev", password: "operator123", role: "operator" },
  { email: "viewer@remotescreen.dev", password: "viewer123", role: "viewer" }
];

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

      const user = VALID_USERS.find((u) => u.email === email && u.password === password);
      if (!user) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        return;
      }

      const userId = `user-${user.role}`;
      const accessToken = jwt.sign(
        {
          sub: userId,
          tenant_id: "tenant-demo",
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
          tenant_id: "tenant-demo",
          role: user.role
        }
      });
    } catch {
      res.status(500).json({ code: "AUTH_FAILED", message: "Internal authentication failure" });
    }
  });

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

  return router;
}
