import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CircuitBreaker } from "./circuit-breaker.js";

describe("PostgreSQL circuit breaker", () => {
  it("allows only one half-open recovery probe", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0, name: "test" });
    breaker.recordFailure(new Error("offline"));

    assert.equal(breaker.getState(), "OPEN");
    assert.equal(breaker.canExecute(), true);
    assert.equal(breaker.getState(), "HALF_OPEN");
    assert.equal(breaker.canExecute(), false);

    breaker.recordSuccess();
    assert.equal(breaker.getState(), "CLOSED");
    assert.equal(breaker.canExecute(), true);
  });
});
