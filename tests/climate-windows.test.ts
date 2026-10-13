import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {buildClimateHistory} from "../lib/climate/windows.ts";
import type {ClimateDayFile, ClimatePoint} from "../lib/climate/types.ts";

const NOW = Date.parse("2026-10-13T13:00:00.000Z");

function point(t: string, tempC: number): ClimatePoint {
    return {t, tempC, humidityPct: 50 + tempC, vpd: tempC / 20};
}

function day(date: string, points: ClimatePoint[]): ClimateDayFile {
    return {date, points};
}

describe("climate windows", () => {
    it("keeps 24h points inside the span and drops a later point", () => {
        const days = new Map<string, ClimateDayFile>([
            ["2026-10-12", day("2026-10-12", [
                point("2026-10-12T13:30:00.000Z", 18),
            ])],
            ["2026-10-13", day("2026-10-13", [
                point("2026-10-13T12:00:00.000Z", 24),
                point("2026-10-13T14:00:00.000Z", 30),
            ])],
        ]);
        const history = buildClimateHistory(days, NOW, "2026-10-01");
        const flat = history["24h"].runs.flat();
        assert.deepEqual(flat.map((row) => row.tempC), [18, 24]);
        assert.equal(history["24h"].stats?.tempC.last, 24);
        assert.equal(history["24h"].stats?.tempC.min, 18);
        assert.equal(history["24h"].stats?.tempC.max, 24);
    });

    it("omits This grow for an empty seed date and for 2001-01-01", () => {
        const days = new Map<string, ClimateDayFile>();
        assert.equal(buildClimateHistory(days, NOW, "").grow, null);
        assert.equal(buildClimateHistory(days, NOW, "2001-01-01").grow, null);
    });

    it("leaves a gap when a 30-day date has no points", () => {
        const days = new Map<string, ClimateDayFile>([
            ["2026-10-11", day("2026-10-11", [point("2026-10-11T10:00:00.000Z", 20)])],
            ["2026-10-13", day("2026-10-13", [point("2026-10-13T10:00:00.000Z", 22)])],
        ]);
        const history = buildClimateHistory(days, NOW, "");
        assert.equal(history["30d"].runs.length, 2);
        assert.equal(history["30d"].runs[0][0].tempC, 20);
        assert.equal(history["30d"].runs[1][0].tempC, 22);
    });

    it("averages a 7-day shelf instead of drawing zero", () => {
        const days = new Map<string, ClimateDayFile>([
            ["2026-10-13", day("2026-10-13", [
                point("2026-10-13T10:00:00.000Z", 20),
                point("2026-10-13T11:00:00.000Z", 22),
            ])],
        ]);
        const history = buildClimateHistory(days, NOW, "");
        const shelf = history["7d"].runs.flat().at(-1);
        assert.equal(shelf?.tempC, 21);
        assert.equal(history["30d"].runs.flat().some((row) => row.tempC === 0), false);
    });
});
