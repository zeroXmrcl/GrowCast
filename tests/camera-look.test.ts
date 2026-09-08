import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    CAMERA_LOOK_DRAFT_EVENT,
    CAMERA_LOOK_MAX,
    CAMERA_LOOK_MESSAGE_TYPE,
    CAMERA_LOOK_MIN,
    EMPTY_CAMERA_LOOK,
    cameraLookFilterCss,
    cameraLookTemperatureStyle,
    isCameraLookMessage,
    parseCameraLook,
    parseCameraLookPct,
} from "../lib/restream/camera-look.ts";
import {readCameraLook, writeCameraLook} from "../lib/restream/camera-look-store.ts";
import {restreamCameraLookFile} from "../lib/restream/paths.ts";

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-look-"));
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

describe("parseCameraLookPct", () => {
    it("rounds, clamps −100…100, and treats junk as 0", () => {
        assert.equal(CAMERA_LOOK_MIN, -100);
        assert.equal(CAMERA_LOOK_MAX, 100);
        assert.equal(parseCameraLookPct(undefined), 0);
        assert.equal(parseCameraLookPct(null), 0);
        assert.equal(parseCameraLookPct(""), 0);
        assert.equal(parseCameraLookPct("wide"), 0);
        assert.equal(parseCameraLookPct(12.4), 12);
        assert.equal(parseCameraLookPct(-200), -100);
        assert.equal(parseCameraLookPct(999), 100);
        assert.equal(parseCameraLookPct("8"), 8);
    });
});

describe("parseCameraLook", () => {
    it("defaults to zeros and ignores junk keys", () => {
        assert.deepEqual(parseCameraLook(null), EMPTY_CAMERA_LOOK);
        assert.deepEqual(parseCameraLook({brightness: 12.4, extra: true}), {
            brightness: 12,
            contrast: 0,
            saturation: 0,
            temperature: 0,
        });
    });
});

describe("cameraLookFilterCss", () => {
    it("omits identity functions and never interpolates raw CSS", () => {
        assert.equal(cameraLookFilterCss(EMPTY_CAMERA_LOOK), "");
        assert.equal(
            cameraLookFilterCss({...EMPTY_CAMERA_LOOK, brightness: 12}),
            "brightness(1.12)",
        );
        assert.equal(
            cameraLookFilterCss({
                brightness: 12,
                contrast: 18,
                saturation: -100,
                temperature: 8,
            }),
            "brightness(1.12) contrast(1.18) saturate(0)",
        );
        const injected = cameraLookFilterCss(
            parseCameraLook({brightness: "url(javascript:alert(1))"}),
        );
        assert.equal(injected, "");
        assert.equal(injected.includes("url("), false);
        assert.equal(injected.includes("javascript"), false);
    });
});

describe("cameraLookTemperatureStyle", () => {
    it("hides at 0, warms positive, cools negative", () => {
        assert.equal(cameraLookTemperatureStyle(0).display, "none");
        const warm = cameraLookTemperatureStyle(40);
        assert.equal(warm.background, "#ff8c4b");
        assert.equal(warm.mixBlendMode, "soft-light");
        assert.equal(warm.opacity, 0.2);
        const cool = cameraLookTemperatureStyle(-100);
        assert.equal(cool.background, "#4b8cff");
        assert.equal(cool.opacity, 0.5);
    });
});

describe("isCameraLookMessage", () => {
    it("accepts the draft type and rejects other payloads", () => {
        assert.equal(CAMERA_LOOK_MESSAGE_TYPE, "growcast-camera-look");
        assert.equal(CAMERA_LOOK_DRAFT_EVENT, "growcast-camera-look-draft");
        assert.equal(
            isCameraLookMessage({
                type: "growcast-camera-look",
                brightness: 1,
                contrast: 0,
                saturation: 0,
                temperature: 0,
            }),
            true,
        );
        assert.equal(isCameraLookMessage({type: "growcast-alert-sting"}), false);
        assert.equal(isCameraLookMessage(null), false);
    });
});

describe("readCameraLook / writeCameraLook", () => {
    it("round-trips clamped JSON off grow JSON and missing file is zeros", async () => {
        await withTempDataDir(async () => {
            assert.deepEqual(await readCameraLook(), EMPTY_CAMERA_LOOK);
            await writeCameraLook({
                brightness: 12.4,
                contrast: 200,
                saturation: -9,
                temperature: 8,
            });
            const disk = JSON.parse(await readFile(restreamCameraLookFile(), "utf8")) as {
                brightness: number;
                contrast: number;
                saturation: number;
                temperature: number;
            };
            assert.deepEqual(disk, {
                brightness: 12,
                contrast: 100,
                saturation: -9,
                temperature: 8,
            });
            assert.equal(restreamCameraLookFile().includes("camera-look.json"), true);
            assert.equal(restreamCameraLookFile().includes("current-grow"), false);
            assert.deepEqual(await readCameraLook(), disk);
        });
    });
});
