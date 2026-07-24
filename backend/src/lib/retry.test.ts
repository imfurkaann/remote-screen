import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTransientDatabaseError, withRetry } from "./retry.js";

function codedError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe("database retry policy", () => {
  it("recognizes transient PostgreSQL and network errors", () => {
    assert.equal(isTransientDatabaseError(codedError("40001")), true);
    assert.equal(isTransientDatabaseError(codedError("08006")), true);
    assert.equal(isTransientDatabaseError(codedError("ECONNRESET")), true);
    assert.equal(isTransientDatabaseError(codedError("23505")), false);
    assert.equal(isTransientDatabaseError(codedError("23514")), false);
  });

  it("does not retry permanent constraint failures", async () => {
    let attempts = 0;
    await assert.rejects(
      withRetry(async () => {
        attempts += 1;
        throw codedError("23505");
      }, "unique-test", { maxRetries: 5, initialDelayMs: 0 }),
      /23505/
    );
    assert.equal(attempts, 1);
  });

  it("retries transient failures and returns the successful result", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw codedError("40001");
      return "ok";
    }, "serialization-test", { maxRetries: 3, initialDelayMs: 0, jitterFactor: 0 });

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });
});
