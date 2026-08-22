import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import {randomBytes, scryptSync} from "node:crypto";
import {
  matchAdminCredentials,
  verifyAdminPassword,
} from "../lib/admin-credentials.ts";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePasswordHardLimits,
  validatePasswordStrength,
} from "../lib/password-policy.ts";

function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminCreatorPath = path.join(projectRoot, "scripts", "admin-creator.mjs");

function runAdminCreator(args: string[], stdin: string, cwd: string) {
  return spawnSync(process.execPath, [adminCreatorPath, ...args], {
    cwd,
    input: stdin,
    encoding: "utf8",
    env: process.env,
  });
}

function parseEnvLocal(envPath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq);
    let value = line.slice(eq + 1);
    if (key === "ADMIN_PASSWORD_HASH") {
      value = value.replace(/\\\$/g, "$");
    }
    out[key] = value;
  }
  return out;
}

describe("admin-creator.mjs (setup:admin)", () => {
  it("rejects short passwords without --allow-insecure and documents both npm forms", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "growcast-admin-secure-"));
    try {
      const result = runAdminCreator([], "admin\nadmin\nadmin\n", cwd);

      assert.notEqual(result.status, 0, "expected non-zero exit");
      const err = `${result.stdout}\n${result.stderr}`;
      assert.match(err, /Minimum length is 12 characters/);
      assert.match(err, /npm run setup:admin -- --allow-insecure/);
      assert.match(err, /npm run setup:admin:insecure/);
      // Broken form is documented as not working, not as a valid re-run option
      assert.match(err, /does not pass the flag through/);
      assert.equal(fs.existsSync(path.join(cwd, ".env.local")), false);
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  });

  it("writes scrypt hash for short passwords with --allow-insecure", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "growcast-admin-insecure-"));
    try {
      const result = runAdminCreator(
        ["--allow-insecure"],
        "admin\nadmin\nadmin\n",
        cwd,
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const envPath = path.join(cwd, ".env.local");
      assert.equal(fs.existsSync(envPath), true);

      const env = parseEnvLocal(envPath);
      assert.equal(env.ADMIN_USERNAME, "admin");
      assert.match(env.ADMIN_PASSWORD_HASH, /^scrypt\$[^$]+\$[^$]+$/);
      assert.ok((env.ADMIN_SESSION_SECRET ?? "").length >= 32);
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  });

  it("short password from insecure setup authenticates via matchAdminCredentials", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "growcast-admin-login-"));
    try {
      const result = runAdminCreator(
        ["--allow-insecure"],
        "devuser\nshort\nshort\n",
        cwd,
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const env = parseEnvLocal(path.join(cwd, ".env.local"));
      const config = {
        username: env.ADMIN_USERNAME,
        passwordHash: env.ADMIN_PASSWORD_HASH,
      };

      assert.equal(validatePasswordStrength("short"), false);
      assert.equal(validatePasswordHardLimits("short"), true);
      assert.equal(matchAdminCredentials("devuser", "short", config), true);
      assert.equal(matchAdminCredentials("devuser", "wrong", config), false);
      assert.equal(matchAdminCredentials("other", "short", config), false);
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  });

  it("merge-preserves GROWCAST_MESH_TOKEN when rewriting .env.local", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "growcast-admin-merge-"));
    try {
      fs.writeFileSync(
        path.join(cwd, ".env.local"),
        "GROWCAST_MESH_TOKEN=keep-this-mesh-token\nLOG_LEVEL=info\nADMIN_USERNAME=old\n",
        "utf8",
      );
      const result = runAdminCreator(
        ["--allow-insecure"],
        "freshadmin\nshort\nshort\n",
        cwd,
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const env = parseEnvLocal(path.join(cwd, ".env.local"));
      assert.equal(env.GROWCAST_MESH_TOKEN, "keep-this-mesh-token");
      assert.equal(env.LOG_LEVEL, "info");
      assert.equal(env.ADMIN_USERNAME, "freshadmin");
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  });
});

describe("password hard limits vs strength (login vs setup)", () => {
  it("hard limits allow short non-empty passwords within max", () => {
    assert.equal(validatePasswordHardLimits(""), false);
    assert.equal(validatePasswordHardLimits("a"), true);
    assert.equal(validatePasswordHardLimits("admin"), true);
    assert.equal(validatePasswordHardLimits("a".repeat(MIN_PASSWORD_LENGTH)), true);
    assert.equal(validatePasswordHardLimits("a".repeat(MAX_PASSWORD_LENGTH)), true);
    assert.equal(validatePasswordHardLimits("a".repeat(MAX_PASSWORD_LENGTH + 1)), false);
  });

  it("strength policy still requires min length", () => {
    assert.equal(validatePasswordStrength("admin"), false);
    assert.equal(validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH - 1)), false);
    assert.equal(validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH)), true);
  });
});

describe("matchAdminCredentials constant-work evaluation", () => {
  it("wrong username still invokes password verify (no short-circuit before scrypt)", () => {
    const password = "correct-horse";
    const config = {
      username: "realadmin",
      passwordHash: hashPassword(password),
    };

    let verifyCalls = 0;
    const spyVerify = (passwordInput: string, storedHash: string) => {
      verifyCalls += 1;
      return verifyAdminPassword(passwordInput, storedHash);
    };

    assert.equal(
      matchAdminCredentials("notadmin", password, config, {verifyPassword: spyVerify}),
      false,
    );
    assert.equal(verifyCalls, 1, "wrong username must still run password verify");

    assert.equal(
      matchAdminCredentials("realadmin", "wrong-pass", config, {verifyPassword: spyVerify}),
      false,
    );
    assert.equal(verifyCalls, 2);

    assert.equal(
      matchAdminCredentials("realadmin", password, config, {verifyPassword: spyVerify}),
      true,
    );
    assert.equal(verifyCalls, 3);
  });
});
