import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {stageClimateArchive} from "../lib/climate/archive.ts";
import {mergeClimatePoints, readClimateDays} from "../lib/climate/store.ts";

describe("climate archive", () => {
    it("copies the days and a failed copy leaves the current file", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "climate-archive-"));
        const previous = process.env.GROWCAST_DATA_DIR;
        process.env.GROWCAST_DATA_DIR = dir;
        try {
            await mergeClimatePoints([{
                t: "2026-10-13T11:00:00.000Z",
                tempC: 24,
                humidityPct: 60,
                vpd: 1.1,
            }]);
            const staging = path.join(dir, "staging");
            await stageClimateArchive(staging, "grow-1", "2026-10-13T12:00:00.000Z", "2026-10-01");
            const archived = JSON.parse(await readFile(path.join(staging, "climate.json"), "utf8")) as {
                days: Record<string, {points: {tempC: number}[]}>;
                startedAt: string;
            };
            assert.equal(archived.days["2026-10-13"].points[0].tempC, 24);
            assert.equal(archived.startedAt, "2026-10-01");
            assert.equal((await readClimateDays()).get("2026-10-13")?.points.length, 1);
        } finally {
            if (previous === undefined) {
                delete process.env.GROWCAST_DATA_DIR;
            } else {
                process.env.GROWCAST_DATA_DIR = previous;
            }
            await rm(dir, {recursive: true, force: true});
        }
    });
});
