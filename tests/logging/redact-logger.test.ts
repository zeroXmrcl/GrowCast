import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { Writable } from "node:stream";
import { REDACT_PATHS, sanitizeError } from "../../lib/logging/redact";
import { resolveLogLevel } from "../../lib/logging/logger";

function capturePinoLog(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });

  const log = pino(
    {
      level: "info",
      base: null,
      redact: {
        paths: REDACT_PATHS,
        censor: "[Redacted]",
      },
    },
    stream,
  );

  log.info(fields);

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  assert.ok(raw.length > 0, "expected logger output");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("redact / logger", () => {
  it("redacts password fields", () => {
    const line = capturePinoLog({
      event: "test",
      password: "super-secret-password",
      ok: true,
    });

    assert.equal(line.password, "[Redacted]");
    assert.equal(line.ok, true);
    assert.equal(line.event, "test");
    assert.doesNotMatch(JSON.stringify(line), /super-secret-password/);
  });

  it("redacts mqtt credential fields", () => {
    const line = capturePinoLog({
      event: "test",
      mqttPwd: "secret-uuid",
      mqttName: "user@example.com",
    });

    assert.equal(line.mqttPwd, "[Redacted]");
    assert.equal(line.mqttName, "[Redacted]");
    assert.doesNotMatch(JSON.stringify(line), /secret-uuid/);
    assert.doesNotMatch(JSON.stringify(line), /user@example.com/);
  });

  it("redacts authorization fields", () => {
    const line = capturePinoLog({
      event: "test",
      authorization: "Bearer secret-token-value",
      Authorization: "Bearer another-token",
    });

    assert.equal(line.authorization, "[Redacted]");
    assert.equal(line.Authorization, "[Redacted]");
    assert.doesNotMatch(JSON.stringify(line), /secret-token-value/);
    assert.doesNotMatch(JSON.stringify(line), /another-token/);
  });

  it("sanitizeError extracts type, message, and stack from Error", () => {
    const err = new TypeError("boom");
    const sanitized = sanitizeError(err);
    assert.equal(sanitized.type, "TypeError");
    assert.equal(sanitized.message, "boom");
    assert.ok(
      typeof sanitized.stack === "string" && sanitized.stack.includes("boom"),
    );
  });

  it("sanitizeError handles non-Error values", () => {
    assert.deepEqual(sanitizeError("plain"), {
      type: "Error",
      message: "plain",
    });
    assert.deepEqual(sanitizeError(42), {
      type: "Error",
      message: "Unknown error",
    });
  });
});

describe("resolveLogLevel", () => {
  it("production clamps quieter-than-info levels up to info", () => {
    assert.equal(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "warn" }),
      "info",
    );
    assert.equal(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "error" }),
      "info",
    );
    assert.equal(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "fatal" }),
      "info",
    );
    assert.equal(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "silent" }),
      "info",
    );
    assert.equal(
      resolveLogLevel({ GROWCAST_ENV: "production", LOG_LEVEL: "warn" }),
      "info",
    );
  });

  it("production keeps info and more-verbose levels", () => {
    assert.equal(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "info" }),
      "info",
    );
    assert.equal(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "debug" }),
      "debug",
    );
    assert.equal(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "trace" }),
      "trace",
    );
  });

  it("production defaults to info when LOG_LEVEL unset", () => {
    assert.equal(resolveLogLevel({ NODE_ENV: "production" }), "info");
  });

  it("development allows quiet levels and defaults to debug", () => {
    assert.equal(resolveLogLevel({ NODE_ENV: "development" }), "debug");
    assert.equal(
      resolveLogLevel({ NODE_ENV: "development", LOG_LEVEL: "warn" }),
      "warn",
    );
    assert.equal(
      resolveLogLevel({ NODE_ENV: "development", LOG_LEVEL: "error" }),
      "error",
    );
  });
});
