import {kindFromActuatorId, lookupWatts, type EnergyOverride} from "@/lib/energy/catalog";
import {
    berlinDateOnly,
    berlinDateWindow,
    berlinDayLengthSeconds,
    berlinDayStartMs,
    berlinHour,
    nextBerlinHourBoundary,
    shiftDateOnly,
} from "@/lib/energy/berlin";
import type {
    EnergyActuatorHours,
    EnergyActuatorRef,
    EnergyDayFile,
    EnergySeriesPoint,
    EnergySeriesWindows,
} from "@/lib/energy/types";
import type {GgsActuatorKind} from "@/lib/ggs-live";

function kindFromKey(refs: Map<string, EnergyActuatorRef>, key: string): {
    kind: GgsActuatorKind;
    id: string;
} {
    const ref = refs.get(key);
    if (ref) {
        return {kind: ref.kind, id: ref.id};
    }
    const sep = key.indexOf(":");
    const id = sep === -1 ? key : key.slice(sep + 1);
    const kind = kindFromActuatorId(id);
    return {kind: kind ?? "outlet", id};
}

function slotWattSeconds(
    slot: EnergyActuatorHours | undefined,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
): {wattSeconds: number; seconds: number} {
    if (!slot) {
        return {wattSeconds: 0, seconds: 0};
    }
    let wattSeconds = 0;
    let seconds = 0;
    for (const [key, levels] of Object.entries(slot)) {
        const identity = kindFromKey(refs, key);
        for (const [level, levelSeconds] of Object.entries(levels)) {
            if (!(levelSeconds > 0)) {
                continue;
            }
            const watts = lookupWatts({
                key,
                kind: identity.kind,
                id: identity.id,
                level,
                on: true,
                overrides,
            });
            wattSeconds += watts * levelSeconds;
            seconds += levelSeconds;
        }
    }
    return {wattSeconds, seconds};
}

function dayWattSeconds(
    day: EnergyDayFile | undefined,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
): {wattSeconds: number; seconds: number} {
    if (!day) {
        return {wattSeconds: 0, seconds: 0};
    }
    let wattSeconds = 0;
    let seconds = 0;
    for (const slot of Object.values(day.hours)) {
        const part = slotWattSeconds(slot, refs, overrides);
        wattSeconds += part.wattSeconds;
        seconds += part.seconds;
    }
    return {wattSeconds, seconds};
}

function averageOrNull(wattSeconds: number, seconds: number, divisorSeconds: number): number | null {
    if (!(seconds > 0)) {
        return null;
    }
    return wattSeconds / Math.max(1, divisorSeconds);
}

function toPoints(buckets: {t: string; watts: number | null}[]): EnergySeriesPoint[] {
    let seen = false;
    let last = 0;
    return buckets.map((bucket) => {
        if (bucket.watts !== null) {
            seen = true;
            last = bucket.watts;
            return {t: bucket.t, watts: bucket.watts};
        }
        if (!seen) {
            return {t: bucket.t, watts: 0};
        }
        return {t: bucket.t, watts: last, held: true};
    });
}

function iso(ms: number): string {
    return new Date(ms).toISOString();
}

function chronologicalWindow(endDate: string, days: number): string[] {
    return berlinDateWindow(endDate, days).slice().reverse();
}

function datesInclusive(startDate: string, endDate: string): string[] {
    const start = startDate <= endDate ? startDate : endDate;
    const end = startDate <= endDate ? endDate : startDate;
    const dates: string[] = [];
    let date = start;
    let guard = 0;
    while (date <= end && guard < 4000) {
        dates.push(date);
        date = shiftDateOnly(date, 1);
        guard += 1;
    }
    return dates.length > 0 ? dates : [endDate];
}

function growStartDate(
    startedAt: string | null,
    days: Map<string, EnergyDayFile>,
    today: string,
): string {
    if (startedAt) {
        const ms = Date.parse(startedAt);
        if (Number.isFinite(ms)) {
            const date = berlinDateOnly(ms);
            return date > today ? today : date;
        }
    }
    let first: string | null = null;
    for (const date of days.keys()) {
        if (!first || date < first) {
            first = date;
        }
    }
    return first ?? today;
}

function todayHourSeries(
    days: Map<string, EnergyDayFile>,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
    nowMs: number,
): EnergySeriesPoint[] {
    const date = berlinDateOnly(nowMs);
    const day = days.get(date);
    const dayStart = berlinDayStartMs(date);
    const buckets: {t: string; watts: number | null}[] = [];
    let t = dayStart;
    let guard = 0;
    while (t <= nowMs && guard < 30) {
        guard += 1;
        const hour = berlinHour(t);
        const boundary = nextBerlinHourBoundary(t);
        const isCurrent = boundary > nowMs;
        const slot = day?.hours[String(hour)];
        const {wattSeconds, seconds} = slotWattSeconds(slot, refs, overrides);
        const divisor = Math.max(1, (Math.min(boundary, nowMs) - t) / 1000);
        buckets.push({t: iso(t), watts: averageOrNull(wattSeconds, seconds, divisor)});
        if (isCurrent) {
            break;
        }
        t = boundary;
        if (berlinDateOnly(t) !== date) {
            break;
        }
    }
    if (buckets.length === 0) {
        buckets.push({t: iso(dayStart), watts: null});
    }
    return toPoints(buckets);
}

function dailySeries(
    dates: string[],
    days: Map<string, EnergyDayFile>,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
    today: string,
    nowMs: number,
): EnergySeriesPoint[] {
    const todayElapsed = Math.max(1, (nowMs - berlinDayStartMs(today)) / 1000);
    const buckets = dates.map((date) => {
        const {wattSeconds, seconds} = dayWattSeconds(days.get(date), refs, overrides);
        const divisor = date === today ? todayElapsed : berlinDayLengthSeconds(date);
        return {t: iso(berlinDayStartMs(date)), watts: averageOrNull(wattSeconds, seconds, divisor)};
    });
    return toPoints(buckets);
}

export function buildEnergySeries(options: {
    days: Map<string, EnergyDayFile>;
    refs: Map<string, EnergyActuatorRef>;
    overrides: readonly EnergyOverride[];
    startedAt: string | null;
    nowMs: number;
}): EnergySeriesWindows {
    const today = berlinDateOnly(options.nowMs);
    const {days, refs, overrides, nowMs} = options;
    return {
        today: {
            kind: "hour",
            points: todayHourSeries(days, refs, overrides, nowMs),
        },
        "7d": {
            kind: "day",
            points: dailySeries(chronologicalWindow(today, 7), days, refs, overrides, today, nowMs),
        },
        "30d": {
            kind: "day",
            points: dailySeries(chronologicalWindow(today, 30), days, refs, overrides, today, nowMs),
        },
        grow: {
            kind: "day",
            points: dailySeries(
                datesInclusive(growStartDate(options.startedAt, days, today), today),
                days,
                refs,
                overrides,
                today,
                nowMs,
            ),
        },
    };
}
