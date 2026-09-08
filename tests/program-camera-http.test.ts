import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {writeCameraLook} from "../lib/restream/camera-look-store.ts";
import {ensureRestreamCaptureToken} from "../lib/restream/capture.ts";
import {programCameraGetResponse} from "../lib/restream/program-http.ts";

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-cam-"));
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

describe("programCameraGetResponse", () => {
    it("denies without auth and returns four ints for admin or capture token", async () => {
        await withTempDataDir(async () => {
            const token = await ensureRestreamCaptureToken();
            await writeCameraLook({
                brightness: 12,
                contrast: 18,
                saturation: 10,
                temperature: 8,
            });
            const denied = await programCameraGetResponse(
                new Request("http://local/api/overlay/program-camera"),
                {admin: false},
            );
            assert.equal(denied.status, 404);
            assert.notEqual(denied.status, 401);

            const asCapture = await programCameraGetResponse(
                new Request("http://local/api/overlay/program-camera", {
                    headers: {"x-growcast-capture": token},
                }),
                {admin: false},
            );
            assert.equal(asCapture.status, 200);
            assert.match(asCapture.headers.get("cache-control") ?? "", /no-store/);
            const body = (await asCapture.json()) as Record<string, unknown>;
            assert.deepEqual(body, {
                brightness: 12,
                contrast: 18,
                saturation: 10,
                temperature: 8,
            });
            assert.equal(JSON.stringify(body).includes("camera-look.json"), false);

            const asAdmin = await programCameraGetResponse(
                new Request("http://local/api/overlay/program-camera"),
                {admin: true},
            );
            assert.equal(asAdmin.status, 200);
        });
    });
});

describe("program-camera route", () => {
    it("uses the program GET helper and request log", () => {
        const route = readFileSync(
            path.join(process.cwd(), "app", "api", "overlay", "program-camera", "route.ts"),
            "utf8",
        );
        assert.match(route, /programCameraGetResponse/);
        assert.match(route, /isAdminAuthenticated/);
        assert.match(route, /withRequestLog/);
        assert.doesNotMatch(route, /401/);
    });
});
