import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { requireObjectJsonBody } from "./validation.js";

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

describe("requireObjectJsonBody", () => {
  it("rejects non-json content-type for post", () => {
    const middleware = requireObjectJsonBody();
    const req = {
      method: "POST",
      path: "/api/v1/content/playlists",
      originalUrl: "/api/v1/content/playlists",
      is: () => false,
      body: { ok: true }
    } as any;
    const res = createRes();

    let nextCalled = false;
    middleware(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 415);
  });

  it("accepts valid json object", () => {
    const middleware = requireObjectJsonBody();
    const req = {
      method: "POST",
      path: "/api/v1/content/playlists",
      originalUrl: "/api/v1/content/playlists",
      is: () => true,
      body: { name: "Playlist" }
    } as any;
    const res = createRes();

    let nextCalled = false;
    middleware(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it("skips configured upload path", () => {
    const middleware = requireObjectJsonBody({ skipPaths: ["/api/v1/content/media/upload"] });
    const req = {
      method: "POST",
      path: "/api/v1/content/media/upload",
      originalUrl: "/api/v1/content/media/upload",
      is: () => false,
      body: null
    } as any;
    const res = createRes();

    let nextCalled = false;
    middleware(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });
});
