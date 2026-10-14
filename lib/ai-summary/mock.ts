import {CLIMATE_METRIC_KEYS, type ClimateMetricKey} from "@/lib/climate/types";
import {encodeMosaicRow} from "@/lib/ai-summary/mosaic";
import {AI_SUMMARY_MOSAIC_SLOTS, type AiSummaryRecord, type MosaicCell} from "@/lib/ai-summary/types";

function emptyMetric() {
    return {
        count: 0,
        min: null as number | null,
        max: null as number | null,
        avg: null as number | null,
        p10: null as number | null,
        p50: null as number | null,
        p90: null as number | null,
        trend: null as number | null,
    };
}

function metric(all: number, day: number, night: number) {
    return {
        all: {...emptyMetric(), count: all, min: 20, max: 28, avg: 24, p10: 21, p50: 24, p90: 26, trend: 0.1},
        day: {...emptyMetric(), count: day, min: 23, max: 28, avg: 25, p10: 23, p50: 25, p90: 27, trend: 0.1},
        night: {...emptyMetric(), count: night, min: 20, max: 23, avg: 21.5, p10: 20, p50: 21, p90: 23, trend: 0},
    };
}

/** Full 24h mosaic: night gaps, mostly in-range, a few afternoon/night deviations. */
export function buildMockMosaic(): Record<ClimateMetricKey, string> {
    const rows = Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [key, Array<MosaicCell>(AI_SUMMARY_MOSAIC_SLOTS).fill(0)]),
    ) as Record<ClimateMetricKey, MosaicCell[]>;

    for (let slot = 0; slot < AI_SUMMARY_MOSAIC_SLOTS; slot += 1) {
        const hour = Math.floor(slot / 12);
        const isDay = hour >= 6 && hour < 24;
        const afternoon = hour >= 14 && hour < 17;
        const lateNight = hour < 5 || hour >= 22;

        rows.tempC[slot] = isDay ? (afternoon && slot % 17 === 0 ? 2 : 1) : lateNight && slot % 23 === 0 ? 2 : 1;
        rows.humidityPct[slot] = isDay ? 1 : slot % 11 === 0 ? 2 : 1;
        rows.vpd[slot] = isDay ? (afternoon && slot % 9 === 0 ? 2 : 1) : 1;
        rows.co2[slot] = isDay ? (slot % 31 === 0 ? 2 : 1) : slot % 7 === 0 ? 3 : 2;
        rows.ppfd[slot] = isDay ? (hour === 6 || hour === 23 ? 2 : 1) : 0;
    }

    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [key, encodeMosaicRow(rows[key])]),
    ) as Record<ClimateMetricKey, string>;
}

export function buildMockAiSummaryRecord(input: {
    date: string;
    score?: number;
    daysSinceSeeding?: number;
}): AiSummaryRecord {
    const score = input.score ?? 78;
    return {
        date: input.date,
        generatedAt: `${input.date}T06:05:00.000Z`,
        growId: "grow-mock",
        stage: {
            stageLabel: "Veg",
            phase: "veg",
            daysSinceSeeding: input.daysSinceSeeding ?? 21,
            flowerWeek: null,
            lightSchedule: "18/6",
            plant: "Cannabis",
            strain: "Demo",
        },
        stats: {
            windowStart: `${input.date}T06:00:00.000Z`,
            windowEnd: `${input.date}T06:00:00.000Z`,
            pointCount: 288,
            dayPointCount: 216,
            nightPointCount: 72,
            unknownDayPointCount: 0,
            lightHours: 18,
            alarmCount: 1,
            metrics: {
                tempC: metric(288, 216, 72),
                humidityPct: metric(288, 216, 72),
                vpd: metric(288, 216, 72),
                co2: metric(288, 216, 72),
                ppfd: metric(216, 216, 0),
            },
        },
        ai: {
            score,
            rating: score >= 80 ? "good" : score >= 65 ? "fair" : "mixed",
            headline: "Veg climate mostly in range, night CO₂ a bit high",
            summary:
                "Over the last 24 hours, daytime temperature and VPD sat in a sensible veg range. Humidity was steady. Night CO₂ ran higher than needed at times, and PPFD covered the light hours.",
            ranges: {
                tempC: {min: 22, max: 28},
                humidityPct: {min: 55, max: 70},
                vpd: {min: 0.8, max: 1.2},
                co2: {min: 600, max: 1200},
                ppfd: {min: 250, max: 600},
            },
            verdicts: {
                tempC: {verdict: "in_range", pctInRange: 91, note: "Daytime temperature fits veg."},
                humidityPct: {verdict: "in_range", pctInRange: 88, note: "RH mostly in range."},
                vpd: {verdict: "slightly_off", pctInRange: 74, note: "A few afternoon peaks."},
                co2: {verdict: "slightly_off", pctInRange: 69, note: "Unnecessarily high at night."},
                ppfd: {verdict: "in_range", pctInRange: 86, note: "Light hours covered."},
            },
            plantObservation:
                "Leaves look turgid, with no obvious deficiency or stress in the frame.",
            recommendations: [
                "Do not raise night CO₂ further.",
                "Ease afternoon VPD spikes with a bit more air exchange.",
                "Keep the 18/6 light schedule.",
            ],
            confidence: 72,
        },
        mosaic: buildMockMosaic(),
        imageUsed: true,
    };
}
