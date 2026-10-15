import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {airVpdKPa} from "../lib/air-vpd.ts";
import {
    evaluateAgainstRange,
    formatMetricReading,
    liveReadingsFromSnapshot,
    mergeLiveMetric,
    mergeLiveMetrics,
    readingsFromStats,
} from "../lib/ai-summary/live-metrics.ts";
import {encodeMosaicRow} from "../lib/ai-summary/mosaic.ts";
import type {AiMetricJudgment, ClimateWindowStats, MosaicCell} from "../lib/ai-summary/types.ts";
import {GGS_PLUGIN_ID, type GgsLivePublic} from "../lib/ggs-live.ts";
import type {ClimateMetricKey} from "../lib/climate/types.ts";

function judgment(overrides: Partial<AiMetricJudgment> = {}): AiMetricJudgment {
    return {verdict: "in_range", pctInRange: 90, note: "on target", ...overrides};
}

function mosaicRow(cells: MosaicCell[]): string {
    return encodeMosaicRow(cells);
}

function allInRangeRow(): string {
    return mosaicRow(Array<MosaicCell>(288).fill(1));
}

function snapshot(sensor: {
    tempC?: number | null;
    humidityPct?: number | null;
    vpd?: number | null;
    co2?: number | null;
    ppfd?: number | null;
    isDay?: boolean | null;
}): GgsLivePublic {
    return {
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud",
        updatedAt: "2026-10-15T10:00:00.000Z",
        online: true,
        stale: false,
        devices: [
            {
                name: "SF-GGS-CB-7088",
                prefix: "CB",
                productType: "SF-GGS-CB",
                online: true,
                sensor: {
                    tempC: sensor.tempC ?? 25.3,
                    humidityPct: sensor.humidityPct ?? 47.1,
                    vpd: sensor.vpd ?? 9.99,
                    co2: sensor.co2 ?? 810,
                    ppfd: sensor.ppfd ?? 420,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                    isDay: sensor.isDay ?? true,
                },
                actuators: [],
            },
        ],
    };
}

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

describe("evaluateAgainstRange", () => {
    const range = {min: 20, max: 28};

    it("marks in-range, close, and far values", () => {
        assert.deepEqual(evaluateAgainstRange(24, range), {verdict: "in_range", inRange: true, cell: 1});
        assert.equal(evaluateAgainstRange(29, range).verdict, "slightly_off");
        assert.equal(evaluateAgainstRange(29, range).inRange, false);
        assert.equal(evaluateAgainstRange(29, range).cell, 5);
        assert.equal(evaluateAgainstRange(19, range).cell, 4);
        assert.equal(evaluateAgainstRange(40, range).verdict, "off");
        assert.equal(evaluateAgainstRange(40, range).cell, 7);
        assert.equal(evaluateAgainstRange(10, range).cell, 6);
    });

    it("is unknown when the value or range is missing", () => {
        assert.deepEqual(evaluateAgainstRange(null, range), {verdict: "unknown", inRange: null, cell: 0});
        assert.deepEqual(evaluateAgainstRange(24, null), {verdict: "unknown", inRange: null, cell: 0});
        assert.deepEqual(evaluateAgainstRange(Number.NaN, range), {verdict: "unknown", inRange: null, cell: 0});
    });
});

describe("readingsFromStats", () => {
    it("prefers p50 and falls back to avg", () => {
        const stats = emptyStats();
        stats.metrics.tempC.all.p50 = 24.6;
        stats.metrics.humidityPct.all.avg = 62.4;
        stats.metrics.vpd.all.p50 = 1.04;
        const readings = readingsFromStats(stats);
        assert.equal(readings.tempC, 24.6);
        assert.equal(readings.humidityPct, 62.4);
        assert.equal(readings.vpd, 1.04);
        assert.equal(readings.co2, null);
        assert.equal(readings.ppfd, null);
    });
});

describe("liveReadingsFromSnapshot", () => {
    it("computes VPD and keeps CO2 and PPFD", () => {
        const bundle = liveReadingsFromSnapshot(snapshot({tempC: 25.3, humidityPct: 47.1, co2: 810, ppfd: 420}));
        assert.equal(bundle.values.tempC, 25.3);
        assert.equal(bundle.values.humidityPct, 47.1);
        assert.equal(bundle.values.vpd, airVpdKPa(25.3, 47.1));
        assert.notEqual(bundle.values.vpd, 9.99);
        assert.equal(bundle.values.co2, 810);
        assert.equal(bundle.values.ppfd, 420);
        assert.equal(bundle.isDay, true);
    });

    it("returns empty readings when there is no snapshot", () => {
        const bundle = liveReadingsFromSnapshot(null);
        assert.equal(bundle.values.tempC, null);
        assert.equal(bundle.isDay, null);
    });
});

describe("mergeLiveMetric", () => {
    const generatedAt = "2026-10-15T06:05:00.000Z";

    it("uses a fresh live value and does not keep the assessment timestamp", () => {
        const merged = mergeLiveMetric({
            key: "tempC",
            range: {min: 22, max: 28},
            assessmentValue: 24.6,
            assessment: judgment(),
            liveValue: 25.1,
            liveFresh: true,
            isDay: true,
            mosaicRow: allInRangeRow(),
            generatedAt,
        });
        assert.equal(merged.value, 25.1);
        assert.equal(merged.source, "live");
        assert.equal(merged.asOf, null);
        assert.equal(merged.valueVerdict, "in_range");
        assert.equal(merged.pctInRange, 100);
        assert.equal(merged.pctVerdict, "in_range");
    });

    it("falls back to the assessment value with as-of when live is stale or missing", () => {
        const stale = mergeLiveMetric({
            key: "tempC",
            range: {min: 22, max: 28},
            assessmentValue: 24.6,
            assessment: judgment({pctInRange: 91}),
            liveValue: 29.4,
            liveFresh: false,
            isDay: true,
            mosaicRow: allInRangeRow(),
            generatedAt,
        });
        assert.equal(stale.value, 24.6);
        assert.equal(stale.source, "assessment");
        assert.equal(stale.asOf, generatedAt);
        assert.equal(stale.pctInRange, 91);
        assert.equal(stale.pctVerdict, "in_range");

        const missing = mergeLiveMetric({
            key: "co2",
            range: {min: 600, max: 1200},
            assessmentValue: 840,
            assessment: judgment({verdict: "slightly_off", pctInRange: 69}),
            liveValue: null,
            liveFresh: true,
            isDay: true,
            mosaicRow: allInRangeRow(),
            generatedAt,
        });
        assert.equal(missing.value, 840);
        assert.equal(missing.source, "assessment");
        assert.equal(missing.asOf, generatedAt);
        assert.equal(missing.pctInRange, 69);
    });

    it("marks a live out-of-range reading and updates pctInRange", () => {
        const merged = mergeLiveMetric({
            key: "tempC",
            range: {min: 22, max: 28},
            assessmentValue: 24.6,
            assessment: judgment({pctInRange: 100}),
            liveValue: 31,
            liveFresh: true,
            isDay: true,
            mosaicRow: allInRangeRow(),
            generatedAt,
        });
        assert.equal(merged.value, 31);
        assert.equal(merged.source, "live");
        assert.equal(merged.valueVerdict, "off");
        assert.equal(merged.pctInRange, 99);
        assert.equal(merged.pctVerdict, "in_range");
    });

    it("does not score lights-off PPFD as out of range", () => {
        const merged = mergeLiveMetric({
            key: "ppfd",
            range: {min: 250, max: 600},
            assessmentValue: 430,
            assessment: judgment({pctInRange: 86}),
            liveValue: 0,
            liveFresh: true,
            isDay: false,
            mosaicRow: allInRangeRow(),
            generatedAt,
        });
        assert.equal(merged.value, 0);
        assert.equal(merged.source, "live");
        assert.equal(merged.asOf, null);
        assert.equal(merged.valueVerdict, "unknown");
        assert.equal(merged.pctInRange, 86);
    });
});

describe("mergeLiveMetrics", () => {
    it("merges each metric independently", () => {
        const keys = ["tempC", "humidityPct", "vpd", "co2", "ppfd"] as const satisfies ClimateMetricKey[];
        const ranges = {
            tempC: {min: 22, max: 28},
            humidityPct: {min: 55, max: 70},
            vpd: {min: 0.8, max: 1.2},
            co2: {min: 600, max: 1200},
            ppfd: {min: 250, max: 600},
        };
        const verdicts = Object.fromEntries(keys.map((key) => [key, judgment()])) as Record<
            ClimateMetricKey,
            AiMetricJudgment
        >;
        const mosaic = Object.fromEntries(keys.map((key) => [key, allInRangeRow()])) as Record<
            ClimateMetricKey,
            string
        >;
        const merged = mergeLiveMetrics({
            ranges,
            verdicts,
            mosaic,
            readings: {tempC: 24.6, humidityPct: 62.4, vpd: 1.04, co2: 840, ppfd: 430},
            generatedAt: "2026-10-15T06:05:00.000Z",
            liveValues: {tempC: 25.1, humidityPct: 48, vpd: 1.5, co2: null, ppfd: 410},
            liveFresh: true,
            isDay: true,
        });
        assert.equal(merged.tempC.source, "live");
        assert.equal(merged.tempC.value, 25.1);
        assert.equal(merged.humidityPct.valueVerdict, "off");
        assert.equal(merged.co2.source, "assessment");
        assert.equal(merged.co2.asOf, "2026-10-15T06:05:00.000Z");
        assert.equal(merged.ppfd.source, "live");
        assert.equal(formatMetricReading("tempC", 25.1), "25.1 °C");
        assert.equal(formatMetricReading("vpd", 1.04), "1.04 kPa");
        assert.equal(formatMetricReading("co2", null), "—");
    });
});
