import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, it} from "node:test";
import {
    ensureSetupCode,
    setupCodesMatch,
    startupBanner,
    startupSiteUrl,
} from "../lib/setup-gate.ts";

describe("setup gate", () => {
    const previous = new Map<string, string | undefined>();

    afterEach(() => {
        for (const key of ["GROWCAST_DATA_DIR", "ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET"]) {
            const value = previous.get(key);
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    it("prints a setup code and accepts it with or without the dash", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-gate-"));
        previous.set("GROWCAST_DATA_DIR", process.env.GROWCAST_DATA_DIR);
        previous.set("ADMIN_USERNAME", process.env.ADMIN_USERNAME);
        previous.set("ADMIN_PASSWORD_HASH", process.env.ADMIN_PASSWORD_HASH);
        previous.set("ADMIN_SESSION_SECRET", process.env.ADMIN_SESSION_SECRET);
        process.env.GROWCAST_DATA_DIR = dir;
        delete process.env.ADMIN_USERNAME;
        delete process.env.ADMIN_PASSWORD_HASH;
        delete process.env.ADMIN_SESSION_SECRET;
        try {
            const code = await ensureSetupCode();
            assert.ok(code);
            assert.match(code, /^[a-z0-9]{4}-[a-z0-9]{4}$/);
            assert.equal(await ensureSetupCode(), code);
            assert.equal(setupCodesMatch(code.replace("-", ""), code), true);
            assert.equal(setupCodesMatch("nope-code", code), false);
            const banner = startupBanner({siteUrl: "http://127.0.0.1:3000", code});
            assert.match(banner, new RegExp(code));
            assert.match(banner, /Setup code/);
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });

    it("builds the local url from the published bind", () => {
        assert.equal(
            startupSiteUrl({GROWCAST_BIND: "0.0.0.0", GROWCAST_PORT: "8080"}),
            "http://127.0.0.1:8080",
        );
        assert.equal(
            startupSiteUrl({GROWCAST_PUBLIC_URL: "https://grow.example/admin"}),
            "https://grow.example",
        );
    });
});
