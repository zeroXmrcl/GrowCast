import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {completeCurrentGrow} from "../lib/archives.ts";
import {berlinDayLengthSeconds, berlinDayStartMs, berlinHour} from "../lib/energy/berlin.ts";
import {_resetEnergyAccrueLockForTests} from "../lib/energy/accrue.ts";
import {buildEnergyDto} from "../lib/energy/scoreboard.ts";
import {buildEnergySeries} from "../lib/energy/series.ts";
import {writeEnergyCursor, writeEnergyDay} from "../lib/energy/store.ts";
import {updateCurrentGrow} from "../lib/db.ts";
import type {EnergyDayFile, EnergySeriesPoint} from "../lib/energy/types.ts";

const LIGHT_KEY = "90E5B1B87088:light";
const NOW_MS = Date.parse("2026-08-23T12:20:00.000Z");

function lightDay(date: string, hours: Record<string, number>): EnergyDayFile {
    const slots: EnergyDayFile["hours"] = {};
    for (const [hour, seconds] of Object.entries(hours)) {
        slots[hour] = {[LIGHT_KEY]: {"100": seconds}};
    }
    return {date, hours: slots};
}

function seriesAt(nowMs = NOW_MS, days: EnergyDayFile[], startedAt: string | null = "2026-08-20T10:00:00.000Z") {
    const map = new Map<string, EnergyDayFile>();
    for (const day of days) {
        map.set(day.date, day);
    }
    return buildEnergySeries({
        days: map,
        refs: new Map(),
        overrides: [],
        startedAt,
        nowMs,
    });
}

function findPoint(points: EnergySeriesPoint[], tMs: number): EnergySeriesPoint | undefined {
    return points.find((point) => Date.parse(point.t) === tMs);
}

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-energy-series-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    _resetEnergyAccrueLockForTests();
    try {
        return await fn(dir);
    } finally {
        _resetEnergyAccrueLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("energy series", () => {
    it("averages a completed hour over 3600 s", () => {
        const series = seriesAt(NOW_MS, [lightDay("2026-08-23", {"12": 1800})]);
        const hour12 = series.today.points.find((point) => berlinHour(Date.parse(point.t)) === 12);
        assert.ok(hour12);
        assert.equal(hour12.watts, 152.5);
        assert.equal(hour12.held, undefined);
    });

    it("averages the current hour over elapsed seconds, not 3600", () => {
        const series = seriesAt(NOW_MS, [lightDay("2026-08-23", {"14": 1200})]);
        const last = series.today.points.at(-1);
        assert.ok(last);
        assert.equal(berlinHour(Date.parse(last.t)), 14);
        assert.equal(last.watts, 305);
        assert.notEqual(last.watts, (305 * 1200) / 3600);
    });

    it("pads leading hours before the first sample with 0, not held", () => {
        const series = seriesAt(NOW_MS, [lightDay("2026-08-23", {"12": 1800})]);
        const leading = series.today.points.filter((point) => berlinHour(Date.parse(point.t)) < 12);
        assert.ok(leading.length > 0);
        for (const point of leading) {
            assert.equal(point.watts, 0);
            assert.equal(point.held, undefined);
        }
    });

    it("holds the previous watts and marks held after the first sample", () => {
        const series = seriesAt(NOW_MS, [lightDay("2026-08-23", {"12": 1800})]);
        const hour13 = series.today.points.find((point) => berlinHour(Date.parse(point.t)) === 13);
        assert.ok(hour13);
        assert.equal(hour13.watts, 152.5);
        assert.equal(hour13.held, true);
    });

    it("stops Today at now rather than the end of the current hour", () => {
        const series = seriesAt(NOW_MS, [lightDay("2026-08-23", {"14": 1200})]);
        const last = series.today.points.at(-1);
        assert.ok(last);
        const start = Date.parse(last.t);
        const durationMs = NOW_MS - start;
        assert.ok(start <= NOW_MS);
        assert.ok(start + durationMs <= NOW_MS);
        assert.equal(start + durationMs, NOW_MS);
        assert.ok(NOW_MS < start + 3600_000);
        for (const point of series.today.points) {
            assert.ok(Date.parse(point.t) <= NOW_MS);
        }
        assert.equal(berlinHour(start), 14);
        assert.equal(series.today.points.length, 15);
    });

    it("emits 6-hour 7d points and pads 0 from the window start", () => {
        const series = seriesAt(NOW_MS, [lightDay("2026-08-23", {"14": 1200})], "2026-08-23T08:00:00.000Z");
        assert.equal(series["7d"].kind, "slot6h");
        assert.equal(series["7d"].points.length, 27);
        assert.equal(series["30d"].points.length, 30);
        const last = series["7d"].points.at(-1);
        assert.ok(last);
        const slotStart = Date.parse(last.t);
        const slotElapsed = (NOW_MS - slotStart) / 1000;
        assert.equal(last.watts, (305 * 1200) / slotElapsed);
        const leading = series["7d"].points.slice(0, -1);
        for (const point of leading) {
            assert.equal(point.watts, 0);
            assert.equal(point.held, undefined);
        }
        assert.equal(series.grow.points.length, 1);
    });

    it("uses actual Berlin civil-day length around DST", () => {
        assert.equal(berlinDayStartMs("2026-08-23"), Date.parse("2026-08-22T22:00:00.000Z"));
        assert.equal(berlinDayLengthSeconds("2026-08-23"), 24 * 3600);
        assert.equal(berlinDayLengthSeconds("2026-03-29"), 23 * 3600);
        assert.equal(berlinDayLengthSeconds("2026-10-25"), 25 * 3600);

        const springNow = Date.parse("2026-03-30T12:00:00.000Z");
        const spring = seriesAt(springNow, [lightDay("2026-03-29", {"10": 3600})], "2026-03-29T00:00:00.000Z");
        const springPoint = findPoint(spring["30d"].points, berlinDayStartMs("2026-03-29"));
        assert.ok(springPoint);
        assert.equal(springPoint.watts, 305 / 23);

        const fallNow = Date.parse("2026-10-26T12:00:00.000Z");
        const fall = seriesAt(fallNow, [lightDay("2026-10-25", {"10": 3600})], "2026-10-25T00:00:00.000Z");
        const fallPoint = findPoint(fall["30d"].points, berlinDayStartMs("2026-10-25"));
        assert.ok(fallPoint);
        assert.equal(fallPoint.watts, 305 / 25);
    });

    it("averages Today fall-back hour 2 over the ~2h civil shelf", () => {
        const nowMs = Date.parse("2026-10-25T12:00:00.000Z");
        const series = seriesAt(nowMs, [lightDay("2026-10-25", {"2": 3600})], "2026-10-25T00:00:00.000Z");
        const hour2 = series.today.points.find((point) => berlinHour(Date.parse(point.t)) === 2);
        assert.ok(hour2);
        assert.equal(hour2.watts, 152.5);
        assert.notEqual(hour2.watts, 305);
    });

    it("draws a flat zero series when the window has no samples", () => {
        const series = seriesAt(NOW_MS, [], null);
        assert.ok(series.today.points.length > 0);
        assert.ok(series.today.points.every((point) => point.watts === 0 && !point.held));
        assert.equal(series["7d"].kind, "slot6h");
        assert.equal(series["7d"].points.length, 27);
        assert.ok(series["7d"].points.every((point) => point.watts === 0 && !point.held));
        assert.equal(series.grow.points.length, 1);
        assert.equal(series.grow.points[0].watts, 0);
    });

    it("attaches series on the current DTO without serials and omits them on archives", async () => {
        await withTempDataDir(async (root) => {
            await writeEnergyCursor({
                growId: "grow-001",
                startedAt: "2026-08-23T08:00:00.000Z",
                lastAccruedAt: "2026-08-23T10:00:00.000Z",
                devices: [],
            });
            await writeEnergyDay(lightDay("2026-08-23", {"12": 1800, "14": 1200}));

            const current = await buildEnergyDto({
                grow: "current",
                tariffKind: "public",
                nowMs: NOW_MS,
            });
            assert.equal(current.ok, true);
            if (!current.ok) {
                return;
            }
            assert.ok(current.dto.series);
            assert.equal(current.dto.series.today.kind, "hour");
            assert.equal(current.dto.series["7d"].kind, "slot6h");
            assert.equal(current.dto.series["7d"].points.length, 27);
            const seriesText = JSON.stringify(current.dto.series);
            const dtoText = JSON.stringify(current.dto);
            assert.equal(seriesText.includes("90E5B1B87088"), false);
            assert.equal(seriesText.includes("serial"), false);
            assert.equal(dtoText.includes("90E5B1B87088"), false);
            assert.equal(dtoText.includes("serial"), false);

            const sources = {
                snapshotsDir: path.join(root, "snapshots"),
                timelapseDir: path.join(root, "timelapse"),
                picturesDir: path.join(root, "pictures"),
            };
            await mkdir(sources.snapshotsDir, {recursive: true});
            await mkdir(sources.timelapseDir, {recursive: true});
            await mkdir(sources.picturesDir, {recursive: true});
            const live = await updateCurrentGrow({
                name: "Energy Series Archive",
                plant: "Basil",
                streamUrl: "",
            });
            await writeEnergyCursor({
                growId: live.id,
                startedAt: "2026-08-23T08:00:00.000Z",
                lastAccruedAt: "2026-08-23T10:00:00.000Z",
                devices: [],
            });
            await writeEnergyDay(lightDay("2026-08-23", {"12": 1800}));
            const completed = await completeCurrentGrow(
                {
                    harvestedAt: "2026-08-23",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(completed.ok, true);
            if (!completed.ok) {
                return;
            }

            const archive = await buildEnergyDto({
                grow: completed.archive.archiveId,
                tariffKind: "public",
            });
            assert.equal(archive.ok, true);
            if (!archive.ok) {
                return;
            }
            assert.equal(archive.dto.series, undefined);
            assert.equal("series" in archive.dto, false);
            assert.equal(JSON.stringify(archive.dto).includes("serial"), false);
        });
    });
});
