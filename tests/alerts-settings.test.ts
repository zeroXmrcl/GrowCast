import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    EMPTY_ALERTS_SETTINGS,
    parseAlertsSettings,
    readAlertsSettings,
    shouldEnqueueKind,
    writeAlertsSettings,
} from "../lib/restream/alerts-settings.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-alerts-"));
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

describe("parseAlertsSettings", () => {
    it("defaults sting on and all twitch kinds on", () => {
        assert.equal(EMPTY_ALERTS_SETTINGS.stingEnabled, true);
        assert.equal(parseAlertsSettings(null).follow, true);
        assert.equal(shouldEnqueueKind(parseAlertsSettings({follow: false}), "follow"), false);
        assert.equal(shouldEnqueueKind(parseAlertsSettings({follow: false}), "manual"), true);
        assert.equal(parseAlertsSettings({stingEnabled: false}).stingEnabled, false);
    });
});

describe("readAlertsSettings", () => {
    it("round-trips alerts.json off grow JSON", async () => {
        await withTempDataDir(async () => {
            await writeAlertsSettings({
                follow: false,
                sub: true,
                raid: true,
                bits: false,
                stingEnabled: false,
            });
            const settings = await readAlertsSettings();
            assert.equal(settings.follow, false);
            assert.equal(settings.sub, true);
            assert.equal(settings.raid, true);
            assert.equal(settings.bits, false);
            assert.equal(settings.stingEnabled, false);
        });
    });
});
