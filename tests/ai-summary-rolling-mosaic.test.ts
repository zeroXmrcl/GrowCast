import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {berlinDateOnly} from "../lib/energy/berlin.ts";
import {writeClimateDay, _resetClimateWriteLockForTests} from "../lib/climate/store.ts";
import {CLIMATE_METRIC_KEYS, CLIMATE_SLOT_MS, type ClimateMetricKey, type ClimatePoint} from "../lib/climate/types.ts";
import {shareFromRow, verdictsFromMosaic} from "../lib/ai-summary/mosaic.ts";
import {
    currentMosaicSlotIndex,
    fetchPublicMosaic,
    liveMosaicCell,
    mosaicCurrentSlotMs,
    mosaicFoldSlotMs,
    mosaicFromPublicBody,
    mosaicWindowEndMs,
    mosaicWindowStartMs,
    overlayLiveMosaic,
    rebuildRollingMosaic,
    rollMosaicForDisplay,
    shiftMosaicRow,
    writeMosaicSlot,
} from "../lib/ai-summary/rolling-mosaic.ts";
import {toPublicAiSummary} from "../lib/ai-summary/public.ts";
import {writeAiSummaryRecord, _resetAiSummaryLockForTests} from "../lib/ai-summary/store.ts";
import {_resetGrowWriteLockForTests} from "../lib/grow-write-lock.ts";
import {_resetEnergyAccrueLockForTests} from "../lib/energy/accrue.ts";
import {AI_SUMMARY_MOSAIC_SLOTS, type AiSummaryRecord, type ClimateWindowStats, type MosaicCell, type StageContext} from "../lib/ai-summary/types.ts";

function emptyStats(): ClimateWindowStats {
    const metric = {
        all: {count: 0, min: null, max: null, avg: null, p10: null, p50: null, p90: null, trend: null},
        day: {count: 0, min: null, max: null, avg: null, p10: null, p50: null, p90: null, trend: null},
        night: {count: 0, min: null, max: null, avg: null, p10: null, p50: null, p90: null, trend: null},
    };
    return {
        windowStart: "2026-10-14T06:00:00.000Z",
        windowEnd: "2026-10-15T06:00:00.000Z",
        pointCount: 0,
        dayPointCount: 0,
        nightPointCount: 0,
        unknownDayPointCount: 0,
        lightHours: null,
        alarmCount: 0,
        metrics: {
            tempC: metric,
            humidityPct: metric,
            vpd: metric,
            co2: metric,
            ppfd: metric,
        },
    };
}

function stage(): StageContext {
    return {
        stageLabel: "Veg",
        phase: "veg",
        daysSinceSeeding: 21,
        flowerWeek: null,
        lightSchedule: "18/6",
        plant: "Cannabis",
        strain: "Test",
    };
}

function ranges() {
    return {
        tempC: {min: 20, max: 28},
        humidityPct: {min: 55, max: 70},
        vpd: {min: 0.8, max: 1.2},
        co2: {min: 700, max: 1200},
        ppfd: {min: 300, max: 600},
    };
}

function verdicts() {
    const verdict = {verdict: "in_range" as const, pctInRange: 91, note: "on target"};
    return {
        tempC: verdict,
        humidityPct: verdict,
        vpd: verdict,
        co2: verdict,
        ppfd: verdict,
    };
}

function blankMosaic(fill: MosaicCell = 0): Record<ClimateMetricKey, string> {
    const row = String(fill).repeat(AI_SUMMARY_MOSAIC_SLOTS);
    return Object.fromEntries(CLIMATE_METRIC_KEYS.map((key) => [key, row])) as Record<ClimateMetricKey, string>;
}

function point(t: string, extra: Partial<ClimatePoint> = {}): ClimatePoint {
    return {
        t,
        tempC: 24,
        humidityPct: 60,
        vpd: 1,
        co2: 800,
        ppfd: 400,
        isDay: true,
        ...extra,
    };
}

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-ai-roll-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = path.join(root, "data");
    await mkdir(process.env.GROWCAST_DATA_DIR, {recursive: true});
    _resetAiSummaryLockForTests();
    _resetGrowWriteLockForTests();
    _resetEnergyAccrueLockForTests();
    _resetClimateWriteLockForTests();
    try {
        return await fn();
    } finally {
        _resetAiSummaryLockForTests();
        _resetGrowWriteLockForTests();
        _resetEnergyAccrueLockForTests();
        _resetClimateWriteLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(root, {recursive: true, force: true});
    }
}

describe("rolling mosaic slot mapping", () => {
    const nowMs = Date.parse("2026-10-15T14:17:30.000Z");
    const windowStart = mosaicWindowStartMs(nowMs);
    const currentSlot = mosaicCurrentSlotMs(nowMs);

    it("puts the current 5-minute slot on the right edge", () => {
        assert.equal(currentMosaicSlotIndex(nowMs, windowStart), AI_SUMMARY_MOSAIC_SLOTS - 1);
        assert.equal((mosaicWindowEndMs(windowStart) - windowStart) / CLIMATE_SLOT_MS, AI_SUMMARY_MOSAIC_SLOTS);
        assert.equal(currentSlot - windowStart, (AI_SUMMARY_MOSAIC_SLOTS - 1) * CLIMATE_SLOT_MS);
        assert.equal(mosaicFoldSlotMs(windowStart, 47), currentSlot);
    });

    it("shifts oldest slots off and pads the right with empty cells", () => {
        const marked = `${"1".repeat(AI_SUMMARY_MOSAIC_SLOTS - 1)}7`;
        const shifted = shiftMosaicRow(marked, 1);
        assert.equal(shifted.length, AI_SUMMARY_MOSAIC_SLOTS);
        assert.equal(shifted[AI_SUMMARY_MOSAIC_SLOTS - 2], "7");
        assert.equal(shifted[AI_SUMMARY_MOSAIC_SLOTS - 1], "0");
        assert.equal(shifted[0], "1");
        assert.equal(shiftMosaicRow(marked, 0), marked);
        assert.equal(shiftMosaicRow(marked, AI_SUMMARY_MOSAIC_SLOTS), "0".repeat(AI_SUMMARY_MOSAIC_SLOTS));
        assert.equal(shiftMosaicRow("7" + "1".repeat(AI_SUMMARY_MOSAIC_SLOTS - 1), -1)[0], "0");
        assert.equal(shiftMosaicRow("7" + "1".repeat(AI_SUMMARY_MOSAIC_SLOTS - 1), -1)[1], "7");
    });
});

describe("rolling mosaic merge and pctInRange", () => {
    const nowMs = Date.parse("2026-10-15T14:17:30.000Z");
    const windowStart = mosaicWindowStartMs(nowMs);

    it("scores only points inside the rolling window", async () => {
        const currentSlot = mosaicCurrentSlotMs(nowMs);
        const mosaic = await rebuildRollingMosaic(ranges(), nowMs, async () => [
            point(new Date(windowStart - CLIMATE_SLOT_MS).toISOString(), {tempC: 40}),
            point(new Date(windowStart).toISOString(), {tempC: 24}),
            point(new Date(currentSlot).toISOString(), {tempC: 40}),
        ]);
        assert.equal(mosaic.tempC[0], "1");
        assert.equal(mosaic.tempC[AI_SUMMARY_MOSAIC_SLOTS - 1], "7");
        assert.equal(shareFromRow(mosaic.tempC), 50);
        const judged = verdictsFromMosaic(mosaic, verdicts());
        assert.equal(judged.tempC.pctInRange, 50);
        assert.equal(judged.tempC.verdict, "off");
        assert.equal(judged.tempC.note, "on target");
    });

    it("does not score lights-off PPFD in rebuild or live overlay", async () => {
        const currentSlot = mosaicCurrentSlotMs(nowMs);
        const mosaic = await rebuildRollingMosaic(ranges(), nowMs, async () => [
            point(new Date(windowStart).toISOString(), {ppfd: 400, isDay: true}),
            point(new Date(currentSlot).toISOString(), {ppfd: 0, isDay: false}),
        ]);
        assert.equal(mosaic.ppfd[0], "1");
        assert.equal(mosaic.ppfd[AI_SUMMARY_MOSAIC_SLOTS - 1], "0");
        assert.equal(shareFromRow(mosaic.ppfd), 100);
        assert.equal(liveMosaicCell("ppfd", 0, ranges().ppfd, false), 0);
        assert.equal(liveMosaicCell("ppfd", 0, ranges().ppfd, true), 6);
        assert.equal(liveMosaicCell("tempC", 24, ranges().tempC, true), 1);
    });

    it("updates the current slot from live readings and refreshes pctInRange", () => {
        const cells = Array<MosaicCell>(AI_SUMMARY_MOSAIC_SLOTS).fill(0);
        for (let i = AI_SUMMARY_MOSAIC_SLOTS - 10; i < AI_SUMMARY_MOSAIC_SLOTS; i += 1) {
            cells[i] = 1;
        }
        const mosaic = {
            ...blankMosaic(0),
            tempC: cells.map(String).join(""),
        };
        const overlaid = overlayLiveMosaic(mosaic, windowStart, nowMs, {
            ranges: ranges(),
            liveValues: {tempC: 40, humidityPct: 60, vpd: 1, co2: 800, ppfd: 400},
            liveFresh: true,
            isDay: true,
        });
        assert.equal(overlaid.tempC[AI_SUMMARY_MOSAIC_SLOTS - 1], "7");
        assert.equal(shareFromRow(overlaid.tempC), 90);
        const stale = overlayLiveMosaic(mosaic, windowStart, nowMs, {
            ranges: ranges(),
            liveValues: {tempC: 40, humidityPct: 60, vpd: 1, co2: 800, ppfd: 400},
            liveFresh: false,
            isDay: true,
        });
        assert.equal(stale.tempC[AI_SUMMARY_MOSAIC_SLOTS - 1], "1");
    });

    it("slides history when time advances and keeps a live overlay on the new edge", () => {
        const later = nowMs + CLIMATE_SLOT_MS;
        const rolled = rollMosaicForDisplay({
            mosaic: blankMosaic(1),
            mosaicWindowStartMs: windowStart,
            nowMs: later,
            ranges: ranges(),
            liveValues: {tempC: 24, humidityPct: 60, vpd: 1, co2: 800, ppfd: 400},
            liveFresh: true,
            isDay: true,
        });
        assert.equal(rolled.windowStartMs, mosaicWindowStartMs(later));
        assert.equal(rolled.mosaic.tempC[0], "1");
        assert.equal(rolled.mosaic.tempC[AI_SUMMARY_MOSAIC_SLOTS - 1], "1");
        const demo = rollMosaicForDisplay({
            mosaic: blankMosaic(1),
            mosaicWindowStartMs: windowStart,
            nowMs: later,
            ranges: ranges(),
            liveValues: {tempC: 40, humidityPct: 60, vpd: 1, co2: 800, ppfd: 400},
            liveFresh: true,
            isDay: true,
            slideHistory: false,
        });
        assert.equal(demo.mosaic.tempC[0], "1");
        assert.equal(demo.mosaic.tempC[AI_SUMMARY_MOSAIC_SLOTS - 1], "7");
    });

    it("writes a live cell into a chosen slot", () => {
        const row = writeMosaicSlot("1".repeat(AI_SUMMARY_MOSAIC_SLOTS), AI_SUMMARY_MOSAIC_SLOTS - 1, 7);
        assert.equal(row[AI_SUMMARY_MOSAIC_SLOTS - 1], "7");
        assert.equal(shareFromRow(row), Math.round(((AI_SUMMARY_MOSAIC_SLOTS - 1) / AI_SUMMARY_MOSAIC_SLOTS) * 100));
    });
});

describe("rolling mosaic public payload", () => {
    it("parses mosaic rows from the public GET body", () => {
        const row = "1".repeat(AI_SUMMARY_MOSAIC_SLOTS);
        assert.equal(mosaicFromPublicBody({available: false}), null);
        assert.equal(mosaicFromPublicBody({available: true, mosaic: {tempC: row}}), null);
        const parsed = mosaicFromPublicBody({
            available: true,
            mosaic: {
                tempC: row,
                humidityPct: row,
                vpd: row,
                co2: row,
                ppfd: `${row}999`,
            },
        });
        assert.equal(parsed?.ppfd.length, AI_SUMMARY_MOSAIC_SLOTS);
        assert.equal(parsed?.ppfd.endsWith("1"), true);
    });

    it("fetches a public mosaic with the injected fetch only", async () => {
        let calls = 0;
        const row = "1".repeat(AI_SUMMARY_MOSAIC_SLOTS);
        const mosaic = await fetchPublicMosaic(async (url) => {
            calls += 1;
            assert.equal(url, "/api/data/ai-summary");
            return Response.json({
                available: true,
                mosaic: {tempC: row, humidityPct: row, vpd: row, co2: row, ppfd: row},
            });
        });
        assert.equal(calls, 1);
        assert.equal(mosaic?.tempC.length, AI_SUMMARY_MOSAIC_SLOTS);
        const failed = await fetchPublicMosaic(async () => {
            throw new Error("network");
        });
        assert.equal(failed, null);
    });

    it("rebuilds the public mosaic from climate files and keeps the last assessment text", async () => {
        await withTempDataDir(async () => {
            const nowMs = Date.parse("2026-10-15T14:17:30.000Z");
            const windowStart = mosaicWindowStartMs(nowMs);
            const currentSlot = mosaicCurrentSlotMs(nowMs);
            const generatedAt = "2026-10-15T06:05:00.000Z";
            const record: AiSummaryRecord = {
                date: "2026-10-15",
                generatedAt,
                growId: "grow-secret",
                stage: stage(),
                stats: emptyStats(),
                ai: {
                    score: 82,
                    rating: "good",
                    headline: "Stable veg climate",
                    summary: "Temperature and VPD fit veg.",
                    ranges: ranges(),
                    verdicts: verdicts(),
                    plantObservation: "Leaves look vigorous.",
                    recommendations: ["Keep night humidity above 55%."],
                    confidence: 70,
                },
                mosaic: blankMosaic(1) as AiSummaryRecord["mosaic"],
                imageUsed: true,
            };
            await writeAiSummaryRecord(record);
            const climatePoints = [
                point(new Date(windowStart - CLIMATE_SLOT_MS).toISOString(), {tempC: 40}),
                point(new Date(windowStart).toISOString(), {tempC: 24}),
                point(new Date(currentSlot).toISOString(), {tempC: 40, ppfd: 0, isDay: false}),
            ];
            const byDate = new Map<string, ClimatePoint[]>();
            for (const sample of climatePoints) {
                const date = berlinDateOnly(Date.parse(sample.t));
                const list = byDate.get(date) ?? [];
                list.push(sample);
                byDate.set(date, list);
            }
            for (const [date, points] of byDate) {
                await writeClimateDay({date, points});
            }

            const pub = await toPublicAiSummary(record, nowMs);
            assert.equal(pub.score, 82);
            assert.equal(pub.rating, "good");
            assert.equal(pub.headline, "Stable veg climate");
            assert.equal(pub.summary, "Temperature and VPD fit veg.");
            assert.equal(pub.confidence, 70);
            assert.equal(pub.generatedAt, generatedAt);
            assert.equal(pub.recommendations[0], "Keep night humidity above 55%.");
            assert.equal(JSON.stringify(pub).includes("grow-secret"), false);
            assert.equal(pub.mosaic.tempC[0], "1");
            assert.equal(pub.mosaic.tempC[AI_SUMMARY_MOSAIC_SLOTS - 1], "7");
            assert.equal(pub.verdicts.tempC.pctInRange, 50);
            assert.equal(pub.verdicts.tempC.verdict, "off");
            assert.equal(pub.verdicts.tempC.note, "on target");
            assert.equal(pub.mosaic.ppfd[AI_SUMMARY_MOSAIC_SLOTS - 1], "0");
            assert.notEqual(pub.mosaic.tempC, record.mosaic.tempC);
        });
    });
});
