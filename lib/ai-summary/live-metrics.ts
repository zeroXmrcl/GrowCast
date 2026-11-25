import {cellForValue, verdictForShare, shareFromRow} from "@/lib/ai-summary/mosaic";
import type {
    AiMetricJudgment,
    ClimateWindowStats,
    DerivedRange,
    MetricVerdict,
    MosaicCell,
} from "@/lib/ai-summary/types";
import {CLIMATE_METRIC_KEYS, type ClimateMetricKey} from "@/lib/ai-summary/climate";
import type {PluginLiveReadings} from "@/lib/plugins/types";

export type LiveMetricSource = "live" | "assessment";

export type MergedLiveMetric = {
    value: number | null;
    source: LiveMetricSource;
    asOf: string | null;
    valueVerdict: MetricVerdict;
    pctInRange: number | null;
    pctVerdict: MetricVerdict;
};

export type LiveReadingsBundle = {
    values: Record<ClimateMetricKey, number | null>;
    isDay: boolean | null;
};

const EMPTY_READINGS: Record<ClimateMetricKey, number | null> = {
    tempC: null,
    humidityPct: null,
    vpd: null,
    co2: null,
    ppfd: null,
};

function finiteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function emptyReadings(): Record<ClimateMetricKey, number | null> {
    return {...EMPTY_READINGS};
}

/** Median of the last AI window, then the average, then unknown. */
export function readingsFromStats(
    stats: Pick<ClimateWindowStats, "metrics">,
): Record<ClimateMetricKey, number | null> {
    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => {
            const all = stats.metrics[key].all;
            return [key, finiteNumber(all.p50) ?? finiteNumber(all.avg)];
        }),
    ) as Record<ClimateMetricKey, number | null>;
}

export function liveReadingsFromPlugin(live: PluginLiveReadings | null): LiveReadingsBundle {
    if (!live) {
        return {values: emptyReadings(), isDay: null};
    }
    return {
        values: {
            tempC: finiteNumber(live.values.tempC),
            humidityPct: finiteNumber(live.values.humidityPct),
            vpd: finiteNumber(live.values.vpd),
            co2: finiteNumber(live.values.co2),
            ppfd: finiteNumber(live.values.ppfd),
        },
        isDay: live.isDay,
    };
}

export function evaluateAgainstRange(
    value: number | null,
    range: DerivedRange | null,
): {verdict: MetricVerdict; inRange: boolean | null; cell: MosaicCell} {
    if (!range || value === null || !Number.isFinite(value)) {
        return {verdict: "unknown", inRange: null, cell: 0};
    }
    const cell = cellForValue(value, range.min, range.max);
    if (cell === 1) {
        return {verdict: "in_range", inRange: true, cell};
    }
    if (cell === 2 || cell === 4 || cell === 5) {
        return {verdict: "slightly_off", inRange: false, cell};
    }
    if (cell === 3 || cell === 6 || cell === 7) {
        return {verdict: "off", inRange: false, cell};
    }
    return {verdict: "unknown", inRange: null, cell: 0};
}

export function mergeLiveMetric(input: {
    key: ClimateMetricKey;
    range: DerivedRange | null;
    assessmentValue: number | null;
    assessment: AiMetricJudgment;
    liveValue: number | null;
    liveFresh: boolean;
    isDay: boolean | null;
    mosaicRow: string;
    generatedAt: string;
}): MergedLiveMetric {
    const lightsOffPpfd = input.key === "ppfd" && input.isDay === false;
    const liveUsable = input.liveFresh && input.liveValue !== null && Number.isFinite(input.liveValue);

    const pctInRange = shareFromRow(input.mosaicRow);
    const pctVerdict = verdictForShare(pctInRange);

    if (liveUsable) {
        const judged = lightsOffPpfd
            ? {verdict: "unknown" as const, inRange: null, cell: 0 as MosaicCell}
            : evaluateAgainstRange(input.liveValue, input.range);
        return {
            value: input.liveValue,
            source: "live",
            asOf: null,
            valueVerdict: judged.verdict,
            pctInRange,
            pctVerdict,
        };
    }

    const judged = evaluateAgainstRange(input.assessmentValue, input.range);
    return {
        value: input.assessmentValue,
        source: "assessment",
        asOf: input.generatedAt,
        valueVerdict: judged.verdict,
        pctInRange,
        pctVerdict,
    };
}

export function mergeLiveMetrics(input: {
    ranges: Record<ClimateMetricKey, DerivedRange | null>;
    verdicts: Record<ClimateMetricKey, AiMetricJudgment>;
    mosaic: Record<ClimateMetricKey, string>;
    readings: Record<ClimateMetricKey, number | null>;
    generatedAt: string;
    liveValues: Record<ClimateMetricKey, number | null>;
    liveFresh: boolean;
    isDay: boolean | null;
}): Record<ClimateMetricKey, MergedLiveMetric> {
    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [
            key,
            mergeLiveMetric({
                key,
                range: input.ranges[key],
                assessmentValue: input.readings[key] ?? null,
                assessment: input.verdicts[key],
                liveValue: input.liveValues[key] ?? null,
                liveFresh: input.liveFresh,
                isDay: input.isDay,
                mosaicRow: input.mosaic[key] ?? "",
                generatedAt: input.generatedAt,
            }),
        ]),
    ) as Record<ClimateMetricKey, MergedLiveMetric>;
}

export function formatMetricReading(key: ClimateMetricKey, value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
        return "—";
    }
    const digits = key === "vpd" ? 2 : key === "tempC" || key === "humidityPct" ? 1 : 0;
    const units: Record<ClimateMetricKey, string> = {
        tempC: "°C",
        humidityPct: "%",
        vpd: "kPa",
        co2: "ppm",
        ppfd: "µmol",
    };
    return `${value.toFixed(digits)} ${units[key]}`;
}
