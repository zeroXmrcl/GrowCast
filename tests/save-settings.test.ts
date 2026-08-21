import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {parseAdminSettingsForm} from "../lib/admin/parse-grow-form.ts";
import {saveAdminSettings} from "../lib/admin/save-settings.ts";

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-save-"));
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

describe("saveAdminSettings orchestration", () => {
    it("returns a structured result shape for a successful dual write path", async () => {
        await withTempDataDir(async () => {
            const form = new FormData();
            form.set("name", "Atomic Save Probe");
            form.set("plant", "Tomato");
            form.set("streamUrl", "https://example.com/stream/");
            form.set("timelapseQuality", "low");
            form.set("timelapseTimezone", "UTC");
            form.set("timelapseLength", "8");

            const parsed = parseAdminSettingsForm(form);
            const result = await saveAdminSettings(parsed);

            assert.equal(result.ok, true);
            if (result.ok) {
                assert.equal(result.grow.name, "Atomic Save Probe");
                assert.equal(result.grow.streamUrl, "https://example.com/stream/");
                assert.equal(result.timelapse.timelapseQuality, "low");
                assert.equal(result.timelapse.timelapseLengthSeconds, 8);
            }
        });
    });
});
