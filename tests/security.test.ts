import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  getBearerToken,
  isMeshTokenAuthorized,
  requireMeshAuth,
} from "../lib/mesh-auth.ts";
import {
  isSafeHttpUrl,
  markdownUrlTransform,
  normalizeOptionalHttpUrl,
  safeHttpUrlOrEmpty,
} from "../lib/url-policy.ts";
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength,
} from "../lib/password-policy.ts";
import {
  MAX_SESSION_TTL_SECONDS,
  SESSION_TTL_SECONDS,
} from "../lib/admin-session-policy.ts";

describe("mesh auth (fail-closed)", () => {
  it("denies when expected token is missing", () => {
    assert.equal(isMeshTokenAuthorized(undefined, "any"), false);
    assert.equal(isMeshTokenAuthorized("", "any"), false);
  });

  it("denies when bearer is missing or wrong", () => {
    assert.equal(isMeshTokenAuthorized("secret-token", undefined), false);
    assert.equal(isMeshTokenAuthorized("secret-token", "wrong"), false);
  });

  it("allows when bearer matches expected token", () => {
    assert.equal(isMeshTokenAuthorized("secret-token", "secret-token"), true);
  });

  it("requireMeshAuth denies without env token", () => {
    const previous = process.env.GROWCAST_MESH_TOKEN;
    delete process.env.GROWCAST_MESH_TOKEN;

    try {
      const response = requireMeshAuth(new Request("http://localhost/api/mesh/x"));
      assert.ok(response instanceof Response);
      assert.equal(response!.status, 401);
    } finally {
      if (previous === undefined) {
        delete process.env.GROWCAST_MESH_TOKEN;
      } else {
        process.env.GROWCAST_MESH_TOKEN = previous;
      }
    }
  });

  it("requireMeshAuth denies wrong Bearer when token configured", () => {
    const previous = process.env.GROWCAST_MESH_TOKEN;
    process.env.GROWCAST_MESH_TOKEN = "correct-mesh-token";

    try {
      const noAuth = requireMeshAuth(new Request("http://localhost/api/mesh/x"));
      assert.equal(noAuth!.status, 401);

      const wrong = requireMeshAuth(
        new Request("http://localhost/api/mesh/x", {
          headers: {Authorization: "Bearer wrong-token"},
        }),
      );
      assert.equal(wrong!.status, 401);

      const ok = requireMeshAuth(
        new Request("http://localhost/api/mesh/x", {
          headers: {Authorization: "Bearer correct-mesh-token"},
        }),
      );
      assert.equal(ok, null);
    } finally {
      if (previous === undefined) {
        delete process.env.GROWCAST_MESH_TOKEN;
      } else {
        process.env.GROWCAST_MESH_TOKEN = previous;
      }
    }
  });

  it("parses Bearer tokens from Authorization header", () => {
    const request = new Request("http://localhost/", {
      headers: {Authorization: "Bearer abc.def"},
    });
    assert.equal(getBearerToken(request), "abc.def");
  });
});

describe("URL policy (http/https only)", () => {
  it("allows https and http absolute URLs", () => {
    assert.equal(isSafeHttpUrl("https://example.com/stream"), true);
    assert.equal(isSafeHttpUrl("http://192.168.1.10:8888/path/"), true);
  });

  it("rejects javascript: and data: schemes", () => {
    assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
    assert.equal(isSafeHttpUrl("data:text/html,hi"), false);
    assert.equal(normalizeOptionalHttpUrl("javascript:alert(1)"), null);
    assert.equal(safeHttpUrlOrEmpty("javascript:alert(1)"), "");
    assert.equal(safeHttpUrlOrEmpty("https://ok.example/a"), "https://ok.example/a");
  });

  it("markdownUrlTransform strips unsafe schemes", () => {
    assert.equal(markdownUrlTransform("https://safe.example/x"), "https://safe.example/x");
    assert.equal(markdownUrlTransform("javascript:alert(1)"), "");
    assert.equal(markdownUrlTransform("data:text/html,x"), "");
    assert.equal(markdownUrlTransform("/relative/path"), "/relative/path");
    assert.equal(markdownUrlTransform("//evil.example/path"), "");
  });
});

describe("password and session policy", () => {
  it("rejects passwords shorter than minimum", () => {
    assert.equal(MIN_PASSWORD_LENGTH, 12);
    for (let length = 1; length < MIN_PASSWORD_LENGTH; length += 1) {
      assert.equal(
        validatePasswordStrength("a".repeat(length)),
        false,
        `length ${length} should fail`,
      );
    }
  });

  it("accepts passwords at least 12 characters", () => {
    assert.equal(validatePasswordStrength("a".repeat(12)), true);
    assert.equal(validatePasswordStrength("secure-pass-99"), true);
  });

  it("session TTL is at most 24 hours", () => {
    assert.ok(SESSION_TTL_SECONDS > 0);
    assert.ok(SESSION_TTL_SECONDS <= 86400);
    assert.ok(SESSION_TTL_SECONDS <= MAX_SESSION_TTL_SECONDS);
    assert.equal(SESSION_TTL_SECONDS, 60 * 60 * 24);
  });
});
