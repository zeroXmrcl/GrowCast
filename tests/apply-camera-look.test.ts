import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {applyCameraLook} from "../lib/admin/apply-camera-look.ts";
import {EMPTY_CAMERA_LOOK} from "../lib/restream/camera-look.ts";
import {readCameraLook} from "../lib/restream/camera-look-store.ts";

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-look-post-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn();
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("applyCameraLook", () => {
    it("rejects a non-object and round-trips a clamped look", async () => {
        await withTempDataDir(async () => {
            assert.deepEqual(await applyCameraLook(null), {ok: false, reason: "invalid_json"});
            assert.deepEqual(await readCameraLook(), EMPTY_CAMERA_LOOK);
            assert.deepEqual(
                await applyCameraLook({
                    brightness: 12.6,
                    contrast: 18,
                    saturation: 10,
                    temperature: 8,
                }),
                {ok: true},
            );
            assert.deepEqual(await readCameraLook(), {
                brightness: 13,
                contrast: 18,
                saturation: 10,
                temperature: 8,
            });
        });
    });
});

describe("camera-look admin route", () => {
    it("is a same-origin JSON POST without a page redirect", () => {
        const route = readFileSync(
            path.join(process.cwd(), "app", "api", "admin", "camera-look", "route.ts"),
            "utf8",
        );
        assert.match(route, /isSameOriginRequest/);
        assert.match(route, /isAdminAuthenticated/);
        assert.match(route, /applyCameraLook/);
        assert.match(route, /invalid_json/);
        assert.doesNotMatch(route, /seeOther/);
        assert.doesNotMatch(route, /redirect\(/);
    });
});
