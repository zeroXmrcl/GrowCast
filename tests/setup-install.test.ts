import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, it} from "node:test";
import {ensureMeshToken, readStoredMeshToken} from "../lib/mesh-token.ts";
import {controllerPrefix} from "../lib/spider-farmer-login.ts";
import {prepareSpiderFarmer} from "../lib/spider-farmer-setup.ts";
import {isRtspUrl} from "../lib/timelapse-sidecar-env.ts";

async function withTempData<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-setup-"));
    const previousDir = process.env.GROWCAST_DATA_DIR;
    const previousToken = process.env.GROWCAST_MESH_TOKEN;
    const previousGgs = process.env.GROWCAST_GGS_ENV_FILE;
    const previousUser = process.env.ADMIN_USERNAME;
    const previousHash = process.env.ADMIN_PASSWORD_HASH;
    const previousSecret = process.env.ADMIN_SESSION_SECRET;
    process.env.GROWCAST_DATA_DIR = dir;
    process.env.GROWCAST_GGS_ENV_FILE = path.join(dir, "ggs.env");
    delete process.env.GROWCAST_MESH_TOKEN;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_SESSION_SECRET;
    try {
        return await fn(dir);
    } finally {
        restore("GROWCAST_DATA_DIR", previousDir);
        restore("GROWCAST_MESH_TOKEN", previousToken);
        restore("GROWCAST_GGS_ENV_FILE", previousGgs);
        restore("ADMIN_USERNAME", previousUser);
        restore("ADMIN_PASSWORD_HASH", previousHash);
        restore("ADMIN_SESSION_SECRET", previousSecret);
        await rm(dir, {recursive: true, force: true});
    }
}

function restore(key: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}

function deviceResponse(list: unknown[]): Response {
    return new Response(JSON.stringify({code: "000", data: {list}}), {status: 200});
}

describe("fresh install helpers", () => {
    afterEach(() => {
        delete process.env.GROWCAST_MESH_TOKEN;
    });

    it("maps Spider Farmer product types to topic prefixes", () => {
        assert.equal(controllerPrefix("SF-GGS-CB"), "CB");
        assert.equal(controllerPrefix("SF-GGS-LC"), "LC");
        assert.equal(controllerPrefix("SF-GGS-PS10"), "PS");
    });

    it("accepts an rtsp camera url", () => {
        assert.equal(isRtspUrl("rtsp://user:secret@10.0.0.8:554/stream"), true);
        assert.equal(isRtspUrl("https://example.com/live"), false);
    });

    it("generates one mesh token and keeps an env token", async () => {
        await withTempData(async () => {
            const created = await ensureMeshToken();
            assert.equal(created.length >= 32, true);
            assert.equal(await ensureMeshToken(), created);
            process.env.GROWCAST_MESH_TOKEN = "env-token-value-that-is-long-enough";
            assert.equal(await ensureMeshToken(), "env-token-value-that-is-long-enough");
            assert.equal(readStoredMeshToken(), "env-token-value-that-is-long-enough");
        });
    });

    it("saves the only controller and asks when there are several", async () => {
        await withTempData(async (dir) => {
            const one: typeof fetch = async (url, init) => {
                const href = String(url);
                if (href.includes("mailLogin")) {
                    return new Response(JSON.stringify({
                        code: "000",
                        data: {mqttName: "grower@example.com", mqttPwd: "broker-secret-value", userId: "42", token: "rest"},
                    }), {status: 200});
                }
                const posted = JSON.parse(String(init?.body)) as {deviceProductGroup: number};
                const list = posted.deviceProductGroup === 0
                    ? [{deviceSerialnum: "abc123", deviceName: "Tent", productType: "SF-GGS-CB"}]
                    : [];
                return deviceResponse(list);
            };
            const saved = await prepareSpiderFarmer({
                email: "grower@example.com",
                password: "secret-password",
                fetchImpl: one,
            });
            assert.equal(saved.ok, true);
            if (saved.ok) {
                assert.equal(saved.serial, "ABC123");
            }
            const env = await readFile(path.join(dir, "ggs.env"), "utf8");
            assert.match(env, /^SF_SERIAL=ABC123$/m);
            assert.match(env, /^SF_PREFIX=CB$/m);
            assert.equal(env.includes("secret-password"), false);

            const many: typeof fetch = async (url, init) => {
                const href = String(url);
                if (href.includes("mailLogin")) {
                    return new Response(JSON.stringify({
                        code: "000",
                        data: {mqttName: "grower@example.com", mqttPwd: "broker-secret-value", userId: "42", token: "rest"},
                    }), {status: 200});
                }
                const posted = JSON.parse(String(init?.body)) as {deviceProductGroup: number};
                const list = posted.deviceProductGroup === 0
                    ? [
                        {deviceSerialnum: "AAA", deviceName: "Box", productType: "SF-GGS-CB"},
                        {deviceSerialnum: "BBB", deviceName: "Light", productType: "SF-GGS-LC"},
                    ]
                    : [];
                return deviceResponse(list);
            };
            const choice = await prepareSpiderFarmer({
                email: "grower@example.com",
                password: "secret-password",
                fetchImpl: many,
            });
            assert.equal(choice.ok, false);
            if (!choice.ok && "choose" in choice) {
                assert.equal(choice.choose.length, 2);
            }
        });
    });
});
