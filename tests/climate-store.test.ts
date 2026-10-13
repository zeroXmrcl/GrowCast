import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";
import {recordClimateFromLive} from "../lib/climate/live.ts";
import {mergeClimatePoints, readClimateDays} from "../lib/climate/store.ts";
import type {ClimatePoint} from "../lib/climate/types.ts";
import type {GgsLiveIngest} from "../lib/ggs-live.ts";

const point = (t: string, tempC: number): ClimatePoint => ({
    t,
    tempC,
    humidityPct: 60,
    vpd: 1,
});

describe("climate day store", () => {
    let dir = "";
    let previous: string | undefined;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), "climate-"));
        previous = process.env.GROWCAST_DATA_DIR;
        process.env.GROWCAST_DATA_DIR = dir;
    });

    afterEach(async () => {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    });

    it("replaces a point with the same timestamp and keeps a new one", async () => {
        await mergeClimatePoints([
            point("2026-10-13T11:00:00.000Z", 20),
            point("2026-10-13T12:00:00.000Z", 21),
        ]);
        await mergeClimatePoints([point("2026-10-13T12:00:00.000Z", 22)]);
        const days = await readClimateDays();
        const saved = days.get("2026-10-13");
        assert.equal(saved?.points.length, 2);
        assert.equal(saved?.points[1].tempC, 22);
        const raw = await readFile(path.join(dir, "climate", "current", "2026-10-13.json"), "utf8");
        assert.equal(JSON.parse(raw).points[0].t < JSON.parse(raw).points[1].t, true);
    });

    it("drops a point that is not finite", async () => {
        await mergeClimatePoints([
            point("2026-10-13T11:00:00.000Z", 20),
            {...point("2026-10-13T12:00:00.000Z", 21), humidityPct: Number.NaN},
        ]);
        const days = await readClimateDays();
        assert.equal(days.get("2026-10-13")?.points.length, 1);
    });

    function ingest(tempC: number | null, humidityPct: number | null): GgsLiveIngest {
        return {
            pluginId: "growcast.ggs",
            source: "ggs-cloud",
            updatedAt: "2026-10-13T13:37:00.000Z",
            online: true,
            devices: [{
                serial: "90E5B1B87088",
                name: "Climate",
                prefix: "CB",
                productType: "SF-GGS-CB",
                online: true,
                sensor: {
                    tempC,
                    humidityPct,
                    vpd: null,
                    co2: null,
                    ppfd: null,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                },
                actuators: [],
            }],
        };
    }

    it("writes a live snapshot that has all three metrics", async () => {
        await recordClimateFromLive(ingest(24.8, 61.4));
        const saved = (await readClimateDays()).get("2026-10-13");
        assert.equal(saved?.points.length, 1);
        assert.equal(saved?.points[0].tempC, 24.8);
        assert.ok(saved && saved.points[0].vpd > 0);
    });

    it("skips a live snapshot missing humidity", async () => {
        await recordClimateFromLive(ingest(24.8, null));
        assert.equal((await readClimateDays()).size, 0);
    });
});
