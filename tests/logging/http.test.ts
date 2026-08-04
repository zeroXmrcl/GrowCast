import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractClientIp, extractUserAgent } from "../../lib/logging/http";

describe("extractClientIp", () => {
  it("prefers cf-connecting-ip over X-Forwarded-For", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1, 192.0.2.1",
    });
    assert.equal(extractClientIp(headers), "203.0.113.10");
  });

  it("uses the first X-Forwarded-For hop when CF header is absent", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, 192.0.2.1",
    });
    assert.equal(extractClientIp(headers), "198.51.100.1");
  });

  it("supports plain record headers and x-real-ip fallback", () => {
    assert.equal(
      extractClientIp({ "x-forwarded-for": "10.0.0.5, 10.0.0.6" }),
      "10.0.0.5",
    );
    assert.equal(extractClientIp({ "x-real-ip": "10.1.2.3" }), "10.1.2.3");
    assert.equal(extractClientIp({}), undefined);
  });
});

describe("extractUserAgent", () => {
  it("returns undefined when missing", () => {
    assert.equal(extractUserAgent(new Headers()), undefined);
  });

  it("truncates user-agent to 256 characters", () => {
    const long = "A".repeat(300);
    const headers = new Headers({ "user-agent": long });
    const ua = extractUserAgent(headers);
    assert.equal(ua?.length, 256);
    assert.equal(ua, "A".repeat(256));
  });
});
