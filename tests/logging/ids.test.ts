import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateRequestId,
  generateSpanId,
  generateTraceId,
  isValidRequestId,
  isValidSpanId,
  isValidTraceId,
} from "../../lib/logging/ids";

describe("ids", () => {
  it("generateRequestId returns a UUID-shaped string accepted by isValidRequestId", () => {
    const id = generateRequestId();
    assert.equal(typeof id, "string");
    assert.ok(id.length >= 36);
    assert.ok(isValidRequestId(id));
    // UUID v4 pattern
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("generateTraceId is 32 lowercase hex characters", () => {
    const id = generateTraceId();
    assert.equal(id.length, 32);
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.ok(isValidTraceId(id));
  });

  it("generateSpanId is 16 lowercase hex characters", () => {
    const id = generateSpanId();
    assert.equal(id.length, 16);
    assert.match(id, /^[0-9a-f]{16}$/);
    assert.ok(isValidSpanId(id));
  });

  it("isValidRequestId rejects empty, short, long, and unsafe values", () => {
    assert.equal(isValidRequestId(""), false);
    assert.equal(isValidRequestId("short"), false);
    assert.equal(isValidRequestId("a".repeat(129)), false);
    assert.equal(isValidRequestId("bad id with spaces!!"), false);
    assert.equal(isValidRequestId(null), false);
    assert.equal(isValidRequestId(123), false);
    assert.ok(isValidRequestId("abcd-efgh-ijkl"));
  });

  it("isValidTraceId / isValidSpanId enforce hex length", () => {
    assert.equal(isValidTraceId("abc"), false);
    assert.equal(isValidTraceId("g".repeat(32)), false);
    assert.equal(isValidSpanId("0".repeat(15)), false);
    assert.ok(isValidTraceId("A".repeat(32))); // case-insensitive accept
    assert.ok(isValidSpanId("b".repeat(16)));
  });
});
