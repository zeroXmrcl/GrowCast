import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {GET} from "../app/api/data/climate-history/route.ts";
import {climateHistoryGetResponse} from "../lib/climate/history-http.ts";
import {_resetClimateWriteLockForTests, writeClimateDay} from "../lib/climate/store.ts";
import {updateCurrentGrow} from "../lib/db.ts";
import {_resetGrowWriteLockForTests} from "../lib/grow-write-lock.ts";
import type {ClimateDayFile, ClimatePoint} from "../lib/climate/types.ts";

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
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-climate-hist-http-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = path.join(root, "data");
    await mkdir(process.env.GROWCAST_DATA_DIR, {recursive: true});
    _resetClimateWriteLockForTests();
    _resetGrowWriteLockForTests();
    try {
        return await fn();
    } finally {
        _resetClimateWriteLockForTests();
        _resetGrowWriteLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(root, {recursive: true, force: true});
    }
}

function requestFor(range?: string): Request {
    const url = range === undefined
        ? "http://localhost/api/data/climate-history"
        : `http://localhost/api/data/climate-history?range=${encodeURIComponent(range)}`;
    return new Request(url);
}

describe("GET /api/data/climate-history", () => {
    it("rejects an unknown range with 400 and no-store", async () => {
        await withTempDataDir(async () => {
            const response = await climateHistoryGetResponse(requestFor("1y"), NOW);
            assert.equal(response.status, 400);
            assert.equal(response.headers.get("cache-control"), "no-store, must-revalidate");
            const body = await response.json() as {error?: string};
            assert.equal(body.error, "invalid_range");
        });
    });

    it("returns graph-shaped windows and strips storage-only fields", async () => {
        await withTempDataDir(async () => {
            await updateCurrentGrow({details: {seededAt: "2026-10-01"}});
            await writeClimateDay(day("2026-10-13", [
                storedPoint("2026-10-13T12:00:00.000Z", 24, {alarm: true, co2: 999, ppfd: 12}),
            ]));
            const response = await climateHistoryGetResponse(requestFor("24h"), NOW);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "no-store, must-revalidate");
            const body = await response.json() as Record<string, unknown>;
            const text = JSON.stringify(body);
            assert.equal(Object.keys(body).sort().join(","), "24h,30d,7d,grow");
            assert.equal(text.includes("co2"), false);
            assert.equal(text.includes("ppfd"), false);
            assert.equal(text.includes("alarm"), false);
            assert.equal(text.includes("isDay"), false);
            assert.equal(text.includes("XAI"), false);
            assert.equal(text.includes("seededAt"), false);
            assert.equal(text.includes("grow-001"), false);
            const window24 = body["24h"] as {runs: Array<Array<{tempC: number}>>; stats: {tempC: {last: number}}};
            assert.equal(window24.stats.tempC.last, 24);
            assert.equal(window24.runs.flat()[0]?.tempC, 24);
            assert.equal((body["7d"] as {runs: unknown[]}).runs.length, 0);
            assert.equal(body.grow, null);
        });
    });

    it("includes This grow only when the seed date is usable", async () => {
        await withTempDataDir(async () => {
            await updateCurrentGrow({details: {seededAt: "2026-10-01"}});
            await writeClimateDay(day("2026-10-13", [
                storedPoint("2026-10-13T12:00:00.000Z", 22),
            ]));
            const withGrow = await climateHistoryGetResponse(requestFor("grow"), NOW);
            const growBody = await withGrow.json() as {grow: {runs: unknown[]} | null};
            assert.ok(growBody.grow);
            assert.ok(growBody.grow.runs.length > 0);

            await updateCurrentGrow({details: {seededAt: "2001-01-01"}});
            const placeholder = await climateHistoryGetResponse(requestFor("grow"), NOW);
            const placeholderBody = await placeholder.json() as {grow: unknown};
            assert.equal(placeholderBody.grow, null);
        });
    });

    it("wraps GET in withRequestLog and stays read-only", async () => {
        const route = await readFile(path.join(process.cwd(), "app", "api", "data", "climate-history", "route.ts"), "utf8");
        assert.match(route, /withRequestLog/);
        assert.match(route, /\/api\/data\/climate-history/);
        assert.match(route, /export async function GET/);
        assert.doesNotMatch(route, /export async function POST/);
        assert.doesNotMatch(route, /XAI_API_KEY|requestGrowSummary|AI_SUMMARY_DAILY_API_CAP/);
        assert.equal(typeof GET, "function");
    });
});
