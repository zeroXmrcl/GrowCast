import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {isTimelapsePluginInstalled} from "../lib/extension-status.ts";

async function withPluginDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-timelapse-"));
    const previous = process.env.GROWCAST_TIMELAPSE_DIR;
    process.env.GROWCAST_TIMELAPSE_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_TIMELAPSE_DIR;
        } else {
            process.env.GROWCAST_TIMELAPSE_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("isTimelapsePluginInstalled", () => {
    it("treats an empty Compose bind-mount as not installed", async () => {
        await withPluginDir(async () => {
            assert.equal(await isTimelapsePluginInstalled(), false);
        });
    });

    it("is installed when a plugin marker file is present", async () => {
        await withPluginDir(async (dir) => {
            await writeFile(path.join(dir, "requirements.txt"), "opencv-python\n");
            assert.equal(await isTimelapsePluginInstalled(), true);
        });
    });

    it("is not installed when only empty snapshot folders exist", async () => {
        await withPluginDir(async (dir) => {
            await mkdir(path.join(dir, "snapshots"), {recursive: true});
            await mkdir(path.join(dir, "timelapse"), {recursive: true});
            assert.equal(await isTimelapsePluginInstalled(), false);
        });
    });

    it("is installed when snapshots exist even without a plugin marker file", async () => {
        await withPluginDir(async (dir) => {
            await mkdir(path.join(dir, "snapshots"), {recursive: true});
            await writeFile(path.join(dir, "snapshots", "1001.webp"), "still");
            assert.equal(await isTimelapsePluginInstalled(), true);
        });
    });

    it("is installed when a timelapse video exists even without a plugin marker file", async () => {
        await withPluginDir(async (dir) => {
            await mkdir(path.join(dir, "timelapse"), {recursive: true});
            await writeFile(path.join(dir, "timelapse", "latest_timelapse.mp4"), "video");
            assert.equal(await isTimelapsePluginInstalled(), true);
        });
    });
});
