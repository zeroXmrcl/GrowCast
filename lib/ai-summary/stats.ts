import {berlinDateOnly, berlinDateWindow} from "@/lib/energy/berlin";
import {CLIMATE_METRIC_KEYS, CLIMATE_SLOT_MS, type ClimateMetricKey, type ClimatePoint} from "@/lib/climate/types";
import {readClimateDay} from "@/lib/climate/store";
import type {ClimateWindowStats, MetricStats, SplitStats} from "@/lib/ai-summary/types";

function emptyStats(): MetricStats {
    return {count: 0, min: null, max: null, avg: null, p10: null, p50: null, p90: null, trend: null};
}

type MetricBucket = {
    all: number[];
    day: number[];
    night: number[];
    allT: number[];
    dayT: number[];
    nightT: number[];
};

function emptyBucket(): MetricBucket {
    return {all: [], day: [], night: [], allT: [], dayT: [], nightT: []};
}

export function percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) {
        return null;
    }
    const index = (sorted.length - 1) * (p / 100);
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    const low = sorted[lo];
    const high = sorted[hi];
    if (low === undefined) {
        return null;
    }
    if (hi === lo || high === undefined) {
        return low;
    }
    return low * (hi - index) + high * (index - lo);
}

export function summarizeValues(values: number[], times: number[] = []): MetricStats {
    if (values.length === 0) {
        return emptyStats();
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const sum = values.reduce((acc, value) => acc + value, 0);
    let trend: number | null = null;
    if (values.length >= 4 && times.length === values.length) {
        const mid = times[0]! + (times[times.length - 1]! - times[0]!) / 2;
        const first: number[] = [];
        const second: number[] = [];
        for (let i = 0; i < values.length; i += 1) {
            if (times[i]! < mid) {
                first.push(values[i]!);
            } else {
                second.push(values[i]!);
            }
        }
        if (first.length > 0 && second.length > 0) {
            const firstAvg = first.reduce((acc, value) => acc + value, 0) / first.length;
            const secondAvg = second.reduce((acc, value) => acc + value, 0) / second.length;
            trend = secondAvg - firstAvg;
        }
    }
    return {
        count: values.length,
        min: sorted[0] ?? null,
        max: sorted[sorted.length - 1] ?? null,
        avg: sum / values.length,
        p10: percentile(sorted, 10),
        p50: percentile(sorted, 50),
        p90: percentile(sorted, 90),
        trend,
    };
}

function pushMetric(
    buckets: Record<ClimateMetricKey, MetricBucket>,
    point: ClimatePoint,
    key: ClimateMetricKey,
): void {
    const value = point[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return;
    }
    const t = Date.parse(point.t);
    buckets[key].all.push(value);
    buckets[key].allT.push(t);
    if (point.isDay === true) {
        buckets[key].day.push(value);
        buckets[key].dayT.push(t);
    } else if (point.isDay === false) {
        buckets[key].night.push(value);
        buckets[key].nightT.push(t);
    }
}

export function aggregateClimateWindow(
    points: ClimatePoint[],
    windowStartMs: number,
    windowEndMs: number,
): ClimateWindowStats {
    const inWindow = points.filter((point) => {
        const t = Date.parse(point.t);
        return Number.isFinite(t) && t >= windowStartMs && t < windowEndMs;
    });
    const buckets = Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [key, emptyBucket()]),
    ) as Record<ClimateMetricKey, MetricBucket>;

    let dayPointCount = 0;
    let nightPointCount = 0;
    let unknownDayPointCount = 0;
    let alarmCount = 0;
    for (const point of inWindow) {
        if (point.isDay === true) {
            dayPointCount += 1;
        } else if (point.isDay === false) {
            nightPointCount += 1;
        } else {
            unknownDayPointCount += 1;
        }
        if (point.alarm) {
            alarmCount += 1;
        }
        for (const key of CLIMATE_METRIC_KEYS) {
            pushMetric(buckets, point, key);
        }
    }

    const metrics = Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => {
            const bucket = buckets[key];
            return [
                key,
                {
                    all: summarizeValues(bucket.all, bucket.allT),
                    day: summarizeValues(bucket.day, bucket.dayT),
                    night: summarizeValues(bucket.night, bucket.nightT),
                } satisfies SplitStats,
            ];
        }),
    ) as Record<ClimateMetricKey, SplitStats>;

    return {
        windowStart: new Date(windowStartMs).toISOString(),
        windowEnd: new Date(windowEndMs).toISOString(),
        pointCount: inWindow.length,
        dayPointCount,
        nightPointCount,
        unknownDayPointCount,
        lightHours: dayPointCount > 0 ? (dayPointCount * CLIMATE_SLOT_MS) / 3_600_000 : dayPointCount === 0 && nightPointCount === 0 ? null : 0,
        alarmCount,
        metrics,
    };
}

export async function loadClimatePointsForWindow(
    windowStartMs: number,
    windowEndMs: number,
): Promise<ClimatePoint[]> {
    const startDate = berlinDateOnly(windowStartMs);
    const endDate = berlinDateOnly(windowEndMs - 1);
    const dates = berlinDateWindow(endDate, 3).filter((date) => date >= startDate && date <= endDate);
    if (!dates.includes(startDate)) {
        dates.push(startDate);
    }
    dates.sort();
    const points: ClimatePoint[] = [];
    for (const date of dates) {
        const day = await readClimateDay(date);
        if (day) {
            points.push(...day.points);
        }
    }
    return points.sort((a, b) => a.t.localeCompare(b.t));
}

export function roundStat(value: number | null, digits: number): number | null {
    if (value === null || !Number.isFinite(value)) {
        return null;
    }
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

export function compactWindowStats(stats: ClimateWindowStats): ClimateWindowStats {
    const digits: Record<ClimateMetricKey, number> = {
        tempC: 2,
        humidityPct: 1,
        vpd: 3,
        co2: 0,
        ppfd: 0,
    };
    const metrics = Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => {
            const split = stats.metrics[key];
            const compact = (part: MetricStats): MetricStats => ({
                count: part.count,
                min: roundStat(part.min, digits[key]),
                max: roundStat(part.max, digits[key]),
                avg: roundStat(part.avg, digits[key]),
                p10: roundStat(part.p10, digits[key]),
                p50: roundStat(part.p50, digits[key]),
                p90: roundStat(part.p90, digits[key]),
                trend: roundStat(part.trend, digits[key]),
            });
            return [key, {all: compact(split.all), day: compact(split.day), night: compact(split.night)}];
        }),
    ) as Record<ClimateMetricKey, SplitStats>;
    return {
        ...stats,
        lightHours: roundStat(stats.lightHours, 2),
        metrics,
    };
}
