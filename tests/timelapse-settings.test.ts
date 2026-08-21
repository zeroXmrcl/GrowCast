import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile, mkdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    DEFAULT_TIMELAPSE_SETTINGS,
    getTimelapseSettingsRecord,
    TIMELAPSE_PLUGIN_ID,
} from "../lib/timelapse-settings.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-tl-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function pluginPath(dir: string): string {
    return path.join(dir, "mesh", `${TIMELAPSE_PLUGIN_ID}.json`);
}

describe("getTimelapseSettingsRecord", () => {
    it("creates defaults only when the file is missing", async () => {
        await withTempDataDir(async (dir) => {
            const record = await getTimelapseSettingsRecord();
            assert.equal(record.settings.timelapseQuality, DEFAULT_TIMELAPSE_SETTINGS.timelapseQuality);
            const written = JSON.parse(await readFile(pluginPath(dir), "utf8"));
            assert.equal(written.timelapseQuality, DEFAULT_TIMELAPSE_SETTINGS.timelapseQuality);
        });
    });

    it("does not overwrite a corrupt settings file", async () => {
        await withTempDataDir(async (dir) => {
            await mkdir(path.dirname(pluginPath(dir)), {recursive: true});
            await writeFile(pluginPath(dir), "{not-json", "utf8");

            const record = await getTimelapseSettingsRecord();
            assert.equal(record.settings.timelapseQuality, DEFAULT_TIMELAPSE_SETTINGS.timelapseQuality);
            assert.equal(await readFile(pluginPath(dir), "utf8"), "{not-json");
        });
    });
});
