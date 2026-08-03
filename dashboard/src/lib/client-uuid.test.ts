import assert from "node:assert/strict";
import test from "node:test";

import { createClientId } from "./client-uuid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uses randomUUID when the browser provides it", () => {
  const expected = "123e4567-e89b-42d3-a456-426614174000";
  const cryptoApi = {
    randomUUID: () => expected,
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => array,
  };

  assert.equal(createClientId(cryptoApi), expected);
});

test("creates a UUID v4 when randomUUID is unavailable on plain HTTP", () => {
  const cryptoApi = {
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) array.fill(0x11);
      return array;
    },
  };

  assert.match(createClientId(cryptoApi), UUID_V4);
});
