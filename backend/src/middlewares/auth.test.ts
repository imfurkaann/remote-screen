import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import { requireRoles, requireUserAuth } from "./auth.js";

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

function createRes(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
}

describe("auth middleware claim checks", () => {
  const jwtSecret = "test-secret";
  const options = { issuer: "remote-screen", audience: "remote-screen-clients" };

  it("rejects missing bearer token", () => {
    const middleware = requireUserAuth(jwtSecret, options);
    const req = { headers: {} } as any;
    const res = createRes();

    let nextCalled = false;
    middleware(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it("accepts token with valid claims", () => {
    const token = jwt.sign(
      {
        sub: "user-a",
        tenant_id: "tenant-a",
        role: "tenant_admin"
      },
      jwtSecret,
      {
        issuer: options.issuer,
        audience: options.audience,
        expiresIn: "5m",
        notBefore: "0s"
      }
    );

    const middleware = requireUserAuth(jwtSecret, options);
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const res = createRes();

    let nextCalled = false;
    middleware(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.auth.userId, "user-a");
    assert.equal(req.auth.tenantId, "tenant-a");
  });

  it("rejects token with wrong audience", () => {
    const token = jwt.sign(
      {
        sub: "user-a",
        tenant_id: "tenant-a",
        role: "tenant_admin"
      },
      jwtSecret,
      {
        issuer: options.issuer,
        audience: "wrong-audience",
        expiresIn: "5m",
        notBefore: "0s"
      }
    );

    const middleware = requireUserAuth(jwtSecret, options);
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const res = createRes();

    let nextCalled = false;
    middleware(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });
});

describe("role middleware", () => {
  it("blocks disallowed role", () => {
    const middleware = requireRoles(["tenant_owner"]);
    const req = { auth: { role: "operator" } } as any;
    const res = createRes();

    let nextCalled = false;
    middleware(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});
