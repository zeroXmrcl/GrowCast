import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, it} from "node:test";
import {ensureMeshToken, readStoredMeshToken} from "../lib/mesh-token.ts";
import {isRtspUrl} from "../plugins/timelapse/host/timelapse-sidecar-env.ts";

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

describe("fresh install helpers", () => {
    afterEach(() => {
        delete process.env.GROWCAST_MESH_TOKEN;
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
});
