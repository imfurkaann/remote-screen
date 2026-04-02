import { Router } from "express";
import jwt from "jsonwebtoken";

type AuthRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

export function buildAuthRouter(deps: AuthRouteDeps): Router {
  const router = Router();

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
