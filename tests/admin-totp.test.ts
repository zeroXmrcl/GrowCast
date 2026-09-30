import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import {Writable} from "node:stream";
import pino from "pino";
import {hashAdminPassword} from "../lib/admin-credentials.ts";
import {
    ADMIN_PENDING_COOKIE,
    ADMIN_SESSION_COOKIE,
    PENDING_TTL_SECONDS,
    gateAdminPassword,
    isAdminAuthenticated,
    loginAdmin,
    secondFactorAttemptKey,
    verifyAdminSecondFactor,
    type AdminAuthCookies,
} from "../lib/admin-auth.ts";
import {SESSION_TTL_SECONDS} from "../lib/admin-session-policy.ts";
import {
    getAdminLoginAttemptStore,
    getAdminSessionStore,
} from "../lib/admin-session-store.ts";
import {
    activeTotpPath,
    beginTotpSetup,
    confirmPendingTotp,
    consumeSecondFactor,
    encodeBase32,
    generateRecoveryCodes,
    generateTotpSecret,
    matchTotpStep,
    pendingTotpPath,
    totpCodeForStep,
    totpStep,
} from "../lib/admin-totp.ts";
import {renderTotpQrSvg} from "../lib/admin-totp-qr.ts";
import {REDACT_PATHS} from "../lib/logging/redact.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

class MemoryCookies implements AdminAuthCookies {
    values = new Map<string, string>();
    options = new Map<string, {maxAge: number; path: string}>();

    get(name: string): string | undefined {
        return this.values.get(name);
    }

    set(name: string, value: string, options: {maxAge: number; path: string}): void {
        this.values.set(name, value);
        this.options.set(name, options);
    }

    delete(name: string): void {
        this.values.delete(name);
        this.options.delete(name);
    }
}

type Fixture = {
    dir: string;
    username: string;
    password: string;
    passwordHash: string;
    sessionSecret: string;
};

async function withAdmin<T>(fn: (fixture: Fixture) => Promise<T>): Promise<T> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "growcast-totp-"));
    const previous = {
        ADMIN_USERNAME: process.env.ADMIN_USERNAME,
        ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
        ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
        GROWCAST_DATA_DIR: process.env.GROWCAST_DATA_DIR,
    };
    const fixture: Fixture = {
        dir,
        username: "grow-admin",
        password: "correct-horse",
        passwordHash: hashAdminPassword("correct-horse"),
        sessionSecret: "s".repeat(48),
    };
    process.env.ADMIN_USERNAME = fixture.username;
    process.env.ADMIN_PASSWORD_HASH = fixture.passwordHash;
    process.env.ADMIN_SESSION_SECRET = fixture.sessionSecret;
    process.env.GROWCAST_DATA_DIR = dir;
    getAdminSessionStore().clear();
    getAdminLoginAttemptStore().clear();
    try {
        return await fn(fixture);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        getAdminSessionStore().clear();
        getAdminLoginAttemptStore().clear();
        fs.rmSync(dir, {recursive: true, force: true});
    }
}

function account(fixture: Fixture) {
    return {username: fixture.username, passwordHash: fixture.passwordHash};
}

async function enroll(fixture: Fixture, nowMs: number) {
    const secret = generateTotpSecret();
    await beginTotpSetup(account(fixture), fixture.sessionSecret, fixture.username, secret);
    const code = totpCodeForStep(secret, totpStep(nowMs));
    const confirmed = await confirmPendingTotp(account(fixture), fixture.sessionSecret, code, nowMs);
    assert.equal(confirmed.ok, true);
    if (!confirmed.ok) {
        throw new Error("enroll failed");
    }
    return {secret, recoveryCodes: confirmed.recoveryCodes};
}

describe("admin totp", {concurrency: 1}, () => {
    it("matches the RFC 6238 SHA1 vector and the skew window", () => {
        const secret = Buffer.from("12345678901234567890");
        assert.equal(totpCodeForStep(secret, 1), "287082");

        const now = 1_700_000_030_000;
        const step = totpStep(now);
        assert.equal(matchTotpStep(secret, totpCodeForStep(secret, step), 0, now), step);
        assert.equal(matchTotpStep(secret, totpCodeForStep(secret, step - 1), 0, now), step - 1);
        assert.equal(matchTotpStep(secret, totpCodeForStep(secret, step + 1), 0, now), step + 1);
        assert.equal(matchTotpStep(secret, totpCodeForStep(secret, step - 2), 0, now), null);
        assert.equal(matchTotpStep(secret, totpCodeForStep(secret, step + 2), 0, now), null);
        assert.equal(matchTotpStep(secret, totpCodeForStep(secret, step), step, now), null);
    });

    it("formats ten single-use recovery codes", () => {
        const codes = generateRecoveryCodes();
        assert.equal(codes.length, 10);
        assert.equal(new Set(codes).size, 10);
        for (const code of codes) {
            assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
        }
    });

    it("renders an authenticator QR without logging the secret into the svg source file", async () => {
        const svg = await renderTotpQrSvg("otpauth://totp/GrowCast:grow-admin?secret=JBSWY3DPEHPK3PXP&issuer=GrowCast");
        assert.match(svg, /<svg/);
        assert.doesNotMatch(svg, /<\?xml/);
    });

    it("signs in with a password when authenticator is off", async () => {
        await withAdmin(async (fixture) => {
            const cookies = new MemoryCookies();
            const result = await loginAdmin(fixture.username, fixture.password, "admin-login:plain", {cookies});
            assert.equal(result.ok, true);
            assert.equal(typeof cookies.get(ADMIN_SESSION_COOKIE), "string");
            assert.equal(cookies.get(ADMIN_PENDING_COOKIE), undefined);
            assert.equal(cookies.options.get(ADMIN_SESSION_COOKIE)?.path, "/");
            assert.equal(cookies.options.get(ADMIN_SESSION_COOKIE)?.maxAge, SESSION_TTL_SECONDS);
            assert.equal(await isAdminAuthenticated({cookies}), true);
        });
    });

    it("does not treat a pending cookie as a session", async () => {
        await withAdmin(async (fixture) => {
            const now = Date.now();
            await enroll(fixture, now);
            const cookies = new MemoryCookies();
            const result = await loginAdmin(fixture.username, fixture.password, "admin-login:pending", {cookies});
            assert.equal(result.ok, false);
            if (result.ok) {
                return;
            }
            assert.equal(result.code, "totp_required");
            assert.equal(cookies.get(ADMIN_SESSION_COOKIE), undefined);
            assert.equal(typeof cookies.get(ADMIN_PENDING_COOKIE), "string");
            assert.equal(cookies.options.get(ADMIN_PENDING_COOKIE)?.path, "/admin");
            assert.equal(cookies.options.get(ADMIN_PENDING_COOKIE)?.maxAge, PENDING_TTL_SECONDS);
            assert.equal(await isAdminAuthenticated({cookies}), false);
        });
    });

    it("issues a session only after a valid authenticator code", async () => {
        await withAdmin(async (fixture) => {
            const now = Date.now();
            const enrolled = await enroll(fixture, now);
            const cookies = new MemoryCookies();
            const loginKey = "admin-login:code";
            const password = await loginAdmin(fixture.username, fixture.password, loginKey, {cookies});
            assert.equal(password.ok, false);
            const later = now + 30_000;
            const code = totpCodeForStep(enrolled.secret, totpStep(later));
            const verified = await verifyAdminSecondFactor(
                code,
                "totp",
                secondFactorAttemptKey(loginKey),
                {cookies},
            );
            assert.equal(verified.ok, true);
            assert.equal(cookies.get(ADMIN_PENDING_COOKIE), undefined);
            assert.equal(typeof cookies.get(ADMIN_SESSION_COOKIE), "string");
            assert.equal(await isAdminAuthenticated({cookies}), true);

            const again = new MemoryCookies();
            await loginAdmin(fixture.username, fixture.password, "admin-login:replay", {cookies: again});
            const replay = await verifyAdminSecondFactor(
                code,
                "totp",
                secondFactorAttemptKey("admin-login:replay"),
                {cookies: again},
            );
            assert.equal(replay.ok, false);
            if (!replay.ok) {
                assert.equal(replay.code, "totp_invalid");
            }
            assert.equal(again.get(ADMIN_SESSION_COOKIE), undefined);
        });
    });

    it("clears the pending cookie on the sixth authenticator failure", async () => {
        await withAdmin(async (fixture) => {
            const enrolled = await enroll(fixture, Date.now());
            const cookies = new MemoryCookies();
            const loginKey = "admin-login:sixth";
            await loginAdmin(fixture.username, fixture.password, loginKey, {cookies});
            const totpKey = secondFactorAttemptKey(loginKey);
            const badCode = totpCodeForStep(enrolled.secret, totpStep(Date.now()) + 8);
            for (let attempt = 1; attempt <= 5; attempt += 1) {
                const failed = await verifyAdminSecondFactor(badCode, "totp", totpKey, {cookies});
                assert.equal(failed.ok, false);
                if (!failed.ok) {
                    assert.equal(failed.code, "totp_invalid");
                }
                assert.equal(typeof cookies.get(ADMIN_PENDING_COOKIE), "string");
            }
            const blocked = await verifyAdminSecondFactor(badCode, "totp", totpKey, {cookies});
            assert.equal(blocked.ok, false);
            if (!blocked.ok) {
                assert.equal(blocked.code, "rate_limited");
            }
            assert.equal(cookies.get(ADMIN_PENDING_COOKIE), undefined);
            assert.equal(cookies.get(ADMIN_SESSION_COOKIE), undefined);
        });
    });

    it("accepts a recovery code once", async () => {
        await withAdmin(async (fixture) => {
            const enrolled = await enroll(fixture, Date.now());
            const recoveryCode = enrolled.recoveryCodes[0];
            assert.ok(recoveryCode);
            const cookies = new MemoryCookies();
            await loginAdmin(fixture.username, fixture.password, "admin-login:recovery", {cookies});
            const used = await verifyAdminSecondFactor(
                recoveryCode,
                "recovery",
                secondFactorAttemptKey("admin-login:recovery"),
                {cookies},
            );
            assert.equal(used.ok, true);

            const again = new MemoryCookies();
            await loginAdmin(fixture.username, fixture.password, "admin-login:recovery-2", {cookies: again});
            const reused = await verifyAdminSecondFactor(
                recoveryCode,
                "recovery",
                secondFactorAttemptKey("admin-login:recovery-2"),
                {cookies: again},
            );
            assert.equal(reused.ok, false);
            if (!reused.ok) {
                assert.equal(reused.code, "totp_invalid");
            }
        });
    });

    it("ignores an unconfirmed setup and a file for another account", async () => {
        await withAdmin(async (fixture) => {
            const secret = generateTotpSecret();
            await beginTotpSetup(account(fixture), fixture.sessionSecret, fixture.username, secret);
            const cookies = new MemoryCookies();
            const pendingOnly = await loginAdmin(fixture.username, fixture.password, "admin-login:setup", {cookies});
            assert.equal(pendingOnly.ok, true);
            assert.equal(cookies.get(ADMIN_PENDING_COOKIE), undefined);
            assert.equal(fs.existsSync(pendingTotpPath()), true);
            assert.equal(fs.existsSync(activeTotpPath()), false);

            const now = Date.now();
            const enrolled = await enroll(fixture, now);
            const stored = fs.readFileSync(activeTotpPath(), "utf8");
            assert.equal(stored.includes(encodeBase32(enrolled.secret)), false);
            for (const code of enrolled.recoveryCodes) {
                assert.equal(stored.includes(code), false);
                assert.equal(stored.includes(code.replace(/-/g, "")), false);
            }

            process.env.ADMIN_USERNAME = "other-admin";
            process.env.ADMIN_PASSWORD_HASH = hashAdminPassword("other-password");
            const otherCookies = new MemoryCookies();
            const mismatched = await loginAdmin("other-admin", "other-password", "admin-login:mismatch", {cookies: otherCookies});
            assert.equal(mismatched.ok, true);
            assert.equal(otherCookies.get(ADMIN_PENDING_COOKIE), undefined);
            assert.equal(typeof otherCookies.get(ADMIN_SESSION_COOKIE), "string");
        });
    });

    it("blocks sign-in when authenticator data is corrupt", async () => {
        await withAdmin(async (fixture) => {
            fs.mkdirSync(path.dirname(activeTotpPath()), {recursive: true});
            fs.writeFileSync(activeTotpPath(), "{", "utf8");
            const cookies = new MemoryCookies();
            const result = await loginAdmin(fixture.username, fixture.password, "admin-login:corrupt", {cookies});
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.code, "totp_unavailable");
            }
            assert.equal(cookies.get(ADMIN_SESSION_COOKIE), undefined);
            assert.equal(cookies.get(ADMIN_PENDING_COOKIE), undefined);
        });
    });

    it("rejects a reused authenticator step in the stored file", async () => {
        await withAdmin(async (fixture) => {
            const now = Date.now();
            const enrolled = await enroll(fixture, now);
            const later = now + 30_000;
            const code = totpCodeForStep(enrolled.secret, totpStep(later));
            const first = await consumeSecondFactor(account(fixture), fixture.sessionSecret, code, "totp", later);
            assert.equal(first.ok, true);
            const second = await consumeSecondFactor(account(fixture), fixture.sessionSecret, code, "totp", later);
            assert.equal(second.ok, false);
        });
    });

    it("allows ten password re-checks before the security lockout", async () => {
        await withAdmin(async (fixture) => {
            const key = "admin-security:password-limit";
            for (let attempt = 1; attempt <= 10; attempt += 1) {
                const result = gateAdminPassword("wrong-password", key);
                assert.equal(result.ok, false);
                if (!result.ok) {
                    assert.equal(result.code, "rejected");
                }
            }
            const blocked = gateAdminPassword(fixture.password, key);
            assert.equal(blocked.ok, false);
            if (!blocked.ok) {
                assert.equal(blocked.code, "rate_limited");
            }
        });
    });

    it("does not pass codes or secrets into auth log fields", () => {
        const files = [
            "lib/admin-auth.ts",
            "app/admin/security/actions.ts",
        ];
        for (const relativePath of files) {
            const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
            const calls = source.matchAll(/logAuth\w+\((\{[\s\S]*?\})\)/g);
            for (const call of calls) {
                const fields = call[1] ?? "";
                assert.doesNotMatch(fields, /\b(code|otpauthUrl|manualKey|recoveryCodes|password)\b/);
            }
        }

        const logged = capturePinoLog({
            event: "auth.login.totp_failed",
            totp: "123456",
            otp: "654321",
            recoveryCode: "ABCD-EFGH-JKMNP-QRST",
            recovery_code: "AAAA-BBBB-CCCC-DDDD",
            reason: "totp_invalid",
        });
        assert.equal(logged.totp, "[Redacted]");
        assert.equal(logged.otp, "[Redacted]");
        assert.equal(logged.recoveryCode, "[Redacted]");
        assert.equal(logged.recovery_code, "[Redacted]");
        assert.equal(logged.reason, "totp_invalid");
        assert.ok(REDACT_PATHS.includes("totp"));
        assert.ok(REDACT_PATHS.includes("otp"));
        assert.ok(REDACT_PATHS.includes("recoveryCode"));
        assert.ok(REDACT_PATHS.includes("recovery_code"));
    });

    it("keeps the security page behind admin auth and tells setup about authenticator", () => {
        const page = fs.readFileSync(path.join(projectRoot, "app/admin/security/page.tsx"), "utf8");
        const setup = fs.readFileSync(path.join(projectRoot, "app/setup/actions.ts"), "utf8");
        const login = fs.readFileSync(path.join(projectRoot, "app/admin/actions.ts"), "utf8");
        assert.match(page, /isAdminAuthenticated/);
        assert.match(setup, /This account uses an authenticator/);
        assert.match(login, /step=totp/);
        assert.doesNotMatch(login, /step=totp[^"\n]*username/);
    });
});

function capturePinoLog(fields: Record<string, unknown>): Record<string, unknown> {
    const chunks: Buffer[] = [];
    const stream = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            callback();
        },
    });
    const log = pino({
        level: "info",
        base: null,
        redact: {paths: REDACT_PATHS, censor: "[Redacted]"},
    }, stream);
    log.info(fields);
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}
