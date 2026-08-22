import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractClientIp, extractUserAgent } from "../../lib/logging/http";
import { loginRateLimitKey, shouldUseSecureCookie } from "../../lib/request-trust.ts";

describe("extractClientIp", () => {
  it("does not mint a bucket from spoofed CF-Connecting-IP without proxy trust", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1, 192.0.2.1",
    });
    assert.equal(extractClientIp(headers, {}), undefined);
    assert.equal(loginRateLimitKey(headers, {}), "admin-login:unknown");
  });

  it("uses CF-Connecting-IP for the rate-limit key when proxy trust is enabled", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1, 192.0.2.1",
    });
    const env = {GROWCAST_TRUST_PROXY: "1"};
    assert.equal(extractClientIp(headers, env), "203.0.113.10");
    assert.equal(loginRateLimitKey(headers, env), "admin-login:203.0.113.10");
  });

  it("does not mint a new bucket from spoofed X-Forwarded-For without the tunnel", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, 192.0.2.1",
    });
    assert.equal(extractClientIp(headers), undefined);
    assert.equal(loginRateLimitKey(headers), "admin-login:unknown");
  });

  it("ignores X-Real-IP unless GROWCAST_TRUST_PROXY is set", () => {
    assert.equal(extractClientIp({"x-real-ip": "10.1.2.3"}), undefined);
    assert.equal(
      extractClientIp({"x-real-ip": "10.1.2.3"}, {GROWCAST_TRUST_PROXY: "1"}),
      "10.1.2.3",
    );
  });
});

describe("shouldUseSecureCookie", () => {
  it("is secure when X-Forwarded-Proto is https", () => {
    assert.equal(
      shouldUseSecureCookie(new Headers({"x-forwarded-proto": "https"})),
      true,
    );
  });

  it("is secure when CF-Connecting-IP is present", () => {
    assert.equal(
      shouldUseSecureCookie(new Headers({"cf-connecting-ip": "203.0.113.9"})),
      true,
    );
  });

  it("is not secure on a bare HTTP origin request", () => {
    assert.equal(shouldUseSecureCookie(new Headers()), false);
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

describe("docker compose listen address", () => {
  it("publishes the app port on loopback and enables proxy trust", async () => {
    const {readFile} = await import("node:fs/promises");
    const yml = await readFile(new URL("../../docker-compose.yml", import.meta.url), "utf8");
    assert.match(yml, /127\.0\.0\.1:\$\{GROWCAST_PORT:-3000\}:3000/);
    assert.doesNotMatch(yml, /ports:\s*\n\s*-\s*"\$\{GROWCAST_PORT:-3000\}:3000"/);
    assert.match(yml, /GROWCAST_TRUST_PROXY:\s*"?1"?/);
    assert.doesNotMatch(yml, /-\s*"?\.\/extensions:\/app\/extensions"?/);
    assert.match(
      yml,
      /-\s*"?\.\/extensions\/GrowCast-Timelapse:\/app\/extensions\/GrowCast-Timelapse"?/,
    );
  });

  it("does not recursively chown /app/extensions in the entrypoint", async () => {
    const {readFile} = await import("node:fs/promises");
    const sh = await readFile(new URL("../../docker-entrypoint.sh", import.meta.url), "utf8");
    assert.doesNotMatch(sh, /^\s*\/app\/extensions\s*\\?\s*$/m);
  });
});
