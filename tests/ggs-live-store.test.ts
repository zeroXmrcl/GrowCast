import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {GGS_PLUGIN_ID, parseIngestBody} from "../lib/ggs-live.ts";
import {readGgsLive, saveGgsLive} from "../lib/ggs-live-store.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-ggs-store-"));
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

function validIngest() {
    const parsed = parseIngestBody({
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud",
        updatedAt: "2026-08-22T17:59:50.000Z",
        online: true,
        devices: [
            {
                serial: "90E5B1B87088",
                name: "SF-GGS-CB-7088",
                prefix: "CB",
                productType: "SF-GGS-CB",
                online: true,
                sensor: {
                    tempC: 25.4,
                    humidityPct: 47.2,
                    vpd: 1.71,
                    co2: null,
                    ppfd: null,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                },
                actuators: [],
            },
        ],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
        throw new Error(parsed.error);
    }
    return parsed.value;
}

describe("ggs live store", () => {
    it("returns null when the file is missing", async () => {
        await withTempDataDir(async () => {
            assert.equal(await readGgsLive(), null);
        });
    });

    it("round-trips a snapshot", async () => {
        await withTempDataDir(async (dir) => {
            const ingest = validIngest();
            await saveGgsLive(ingest);
            const file = path.join(dir, "mesh", `${GGS_PLUGIN_ID}.json`);
            const written = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
            assert.equal(written.pluginId, GGS_PLUGIN_ID);
            const read = await readGgsLive();
            assert.equal(read?.devices[0].sensor.tempC, 25.4);
        });
    });

    it("returns null for corrupt JSON", async () => {
        await withTempDataDir(async (dir) => {
            const file = path.join(dir, "mesh", `${GGS_PLUGIN_ID}.json`);
            await mkdir(path.dirname(file), {recursive: true});
            await writeFile(file, "{not-json", "utf8");
            assert.equal(await readGgsLive(), null);
        });
    });
});
