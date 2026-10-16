import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    adaptStoredDays,
    build24hWindow,
    buildClimateHistoryFromStored,
    historyStartDate,
    readPublicClimateHistory,
    seedForHistory,
    toHistoryPoint,
} from "../lib/climate/history-adapter.ts";
import {parseClimateHistoryRange} from "../lib/climate/history-public.ts";
import {_resetClimateWriteLockForTests, writeClimateDay} from "../lib/climate/store.ts";
import {CLIMATE_RETENTION_DAYS, type ClimateDayFile, type ClimatePoint} from "../lib/climate/types.ts";
import {climateRetentionStartDate} from "../lib/climate/writer.ts";
import {berlinDateOnly} from "../lib/energy/berlin.ts";

const NOW = Date.parse("2026-10-13T13:00:00.000Z");

function storedPoint(t: string, tempC: number, extra: Partial<ClimatePoint> = {}): ClimatePoint {
    return {
        t,
        tempC,
        humidityPct: 50 + tempC,
        vpd: tempC / 20,
        co2: 800,
        ppfd: 400,
        isDay: true,
        ...extra,
    };
}

function day(date: string, points: ClimatePoint[]): ClimateDayFile {
    return {date, points};
}

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-climate-hist-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = path.join(root, "data");
    await mkdir(process.env.GROWCAST_DATA_DIR, {recursive: true});
    _resetClimateWriteLockForTests();
    try {
        return await fn();
    } finally {
        _resetClimateWriteLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(root, {recursive: true, force: true});
    }
}

describe("climate history adapter", () => {
    it("keeps only finite temp, humidity, and VPD for the graphs", () => {
        const kept = toHistoryPoint(storedPoint("2026-10-13T12:00:00.000Z", 24, {alarm: true, co2: 900}));
        assert.deepEqual(kept, {
            t: "2026-10-13T12:00:00.000Z",
            tempC: 24,
            humidityPct: 74,
            vpd: 1.2,
        });
        assert.equal(toHistoryPoint(storedPoint("2026-10-13T12:00:00.000Z", 24, {vpd: null})), null);
        assert.equal(toHistoryPoint(storedPoint("2026-10-13T12:00:00.000Z", 24, {tempC: null})), null);
        assert.equal(toHistoryPoint(storedPoint("not-a-date", 24)), null);
    });

    it("drops incomplete stored points from a day map", () => {
        const days = adaptStoredDays([
            day("2026-10-13", [
                storedPoint("2026-10-13T12:00:00.000Z", 24),
                storedPoint("2026-10-13T12:05:00.000Z", 25, {humidityPct: null}),
            ]),
        ]);
        assert.equal(days.get("2026-10-13")?.points.length, 1);
        assert.equal(days.get("2026-10-13")?.points[0]?.tempC, 24);
    });

    it("clamps This grow to climate retention", () => {
        const today = berlinDateOnly(NOW);
        const retainFrom = climateRetentionStartDate(today);
        assert.equal(seedForHistory("2001-01-01", NOW), "2001-01-01");
        assert.equal(seedForHistory("", NOW), "");
        assert.equal(seedForHistory("2026-10-01", NOW), "2026-10-01");
        assert.equal(seedForHistory("2020-01-01", NOW), retainFrom);
        assert.equal(CLIMATE_RETENTION_DAYS, 180);
        assert.equal(historyStartDate(NOW, "2020-01-01"), retainFrom);
    });

    it("keeps 24h points inside the span and drops a later point", () => {
        const history = buildClimateHistoryFromStored([
            day("2026-10-12", [storedPoint("2026-10-12T13:30:00.000Z", 18)]),
            day("2026-10-13", [
                storedPoint("2026-10-13T12:00:00.000Z", 24),
                storedPoint("2026-10-13T14:00:00.000Z", 30),
            ]),
        ], NOW, "2026-10-01");
        const flat = history["24h"].runs.flat();
        assert.deepEqual(flat.map((row) => row.tempC), [18, 24]);
        assert.equal(history["24h"].stats?.tempC.last, 24);
        assert.equal(history["24h"].stats?.tempC.min, 18);
        assert.equal(history["24h"].stats?.tempC.max, 24);
        assert.equal(history.grow !== null, true);
    });

    it("omits This grow for an empty seed date and for 2001-01-01", () => {
        assert.equal(buildClimateHistoryFromStored([], NOW, "").grow, null);
        assert.equal(buildClimateHistoryFromStored([], NOW, "2001-01-01").grow, null);
    });

    it("leaves a gap when a 30-day date has no points", () => {
        const history = buildClimateHistoryFromStored([
            day("2026-10-11", [storedPoint("2026-10-11T10:00:00.000Z", 20)]),
            day("2026-10-13", [storedPoint("2026-10-13T10:00:00.000Z", 22)]),
        ], NOW, "");
        assert.equal(history["30d"].runs.length, 2);
        assert.equal(history["30d"].runs[0][0].tempC, 20);
        assert.equal(history["30d"].runs[1][0].tempC, 22);
    });

    it("averages a 7-day shelf instead of drawing zero", () => {
        const history = buildClimateHistoryFromStored([
            day("2026-10-13", [
                storedPoint("2026-10-13T10:00:00.000Z", 20),
                storedPoint("2026-10-13T11:00:00.000Z", 22),
            ]),
        ], NOW, "");
        const shelf = history["7d"].runs.flat().at(-1);
        assert.equal(shelf?.tempC, 21);
        assert.equal(history["30d"].runs.flat().some((row) => row.tempC === 0), false);
    });

    it("counts a shelf boundary sample in one 7d bucket only", () => {
        const history = buildClimateHistoryFromStored([
            day("2026-10-13", [
                storedPoint("2026-10-13T10:00:00.000Z", 20),
                storedPoint("2026-10-13T11:00:00.000Z", 22),
            ]),
        ], NOW, "");
        const boundaryShelves = history["7d"].runs.flat().filter(
            (row) => row.tempC === 20 || row.tempC === 21,
        );
        assert.equal(boundaryShelves.length, 1);
        assert.equal(boundaryShelves[0]?.tempC, 21);
        assert.equal(history["7d"].runs.flat().filter((row) => row.tempC === 20).length, 0);
    });

    it("counts a midnight Berlin sample in one 30d bucket only", () => {
        const history = buildClimateHistoryFromStored([
            day("2026-10-12", [storedPoint("2026-10-11T22:00:00.000Z", 19)]),
        ], NOW, "");
        assert.equal(history["30d"].runs.flat().filter((row) => row.tempC === 19).length, 1);
    });

    it("keeps a sample exactly at now in 24h and the last 7d shelf", () => {
        const history = buildClimateHistoryFromStored([
            day("2026-10-13", [storedPoint("2026-10-13T13:00:00.000Z", 25)]),
        ], NOW, "");
        assert.equal(history["24h"].runs.flat().some((row) => row.tempC === 25), true);
        assert.equal(history["7d"].runs.flat().at(-1)?.tempC, 25);
    });

    it("reads the 24h window through loadClimatePointsForWindow", async () => {
        await withTempDataDir(async () => {
            await writeClimateDay(day("2026-10-12", [
                storedPoint("2026-10-12T13:30:00.000Z", 18),
                storedPoint("2026-10-12T12:00:00.000Z", 12),
            ]));
            await writeClimateDay(day("2026-10-13", [
                storedPoint("2026-10-13T12:00:00.000Z", 24, {vpd: null}),
                storedPoint("2026-10-13T12:05:00.000Z", 25),
                storedPoint("2026-10-13T14:00:00.000Z", 30),
            ]));
            const window = await build24hWindow(NOW);
            assert.deepEqual(window.runs.flat().map((row) => row.tempC), [18, 25]);
            assert.equal(window.stats?.tempC.last, 25);
            const publicHistory = await readPublicClimateHistory({
                nowMs: NOW,
                seededAt: "2026-10-01",
                range: "24h",
            });
            assert.deepEqual(publicHistory["24h"].runs.flat().map((row) => row.tempC), [18, 25]);
            assert.equal(publicHistory["7d"].runs.length, 0);
            assert.equal(publicHistory.grow, null);
        });
    });

    it("accepts only bounded public range tokens", () => {
        assert.equal(parseClimateHistoryRange(null), "all");
        assert.equal(parseClimateHistoryRange(""), "all");
        assert.equal(parseClimateHistoryRange("all"), "all");
        assert.equal(parseClimateHistoryRange("24h"), "24h");
        assert.equal(parseClimateHistoryRange("7d"), "7d");
        assert.equal(parseClimateHistoryRange("30d"), "30d");
        assert.equal(parseClimateHistoryRange("grow"), "grow");
        assert.equal(parseClimateHistoryRange("1y"), null);
        assert.equal(parseClimateHistoryRange("24H"), null);
        assert.equal(parseClimateHistoryRange("../secret"), null);
        assert.equal(parseClimateHistoryRange("x".repeat(32)), null);
    });
});
