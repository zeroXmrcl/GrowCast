import {isDateOnly} from "@/lib/date-only";
import {
    berlinDateOnly,
    berlinDayStartMs,
    nextBerlinHourBoundary,
    shiftDateOnly,
} from "@/lib/energy/berlin";
import type {ClimateDayFile, ClimateHistoryPublic, ClimatePoint, ClimateWindow} from "@/lib/climate/types";

const EMPTY_SEED = "2001-01-01";

function inSpan(point: ClimatePoint, startMs: number, endMs: number): boolean {
    const ms = Date.parse(point.t);
    return ms >= startMs && ms <= endMs;
}

function inBucket(point: ClimatePoint, startMs: number, endMs: number, closedEnd: boolean): boolean {
    const ms = Date.parse(point.t);
    if (ms < startMs) {
        return false;
    }
    return closedEnd ? ms <= endMs : ms < endMs;
}

function pointsIn(days: Map<string, ClimateDayFile>, startMs: number, endMs: number): ClimatePoint[] {
    const rows: ClimatePoint[] = [];
    for (const day of days.values()) {
        for (const point of day.points) {
            if (inSpan(point, startMs, endMs)) {
                rows.push(point);
            }
        }
    }
    return rows.sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
}

function mean(points: ClimatePoint[], t: string): ClimatePoint {
    const n = points.length;
    const sum = points.reduce((total, point) => ({
        tempC: total.tempC + point.tempC,
        humidityPct: total.humidityPct + point.humidityPct,
        vpd: total.vpd + point.vpd,
    }), {tempC: 0, humidityPct: 0, vpd: 0});
    return {
        t,
        tempC: sum.tempC / n,
        humidityPct: sum.humidityPct / n,
        vpd: sum.vpd / n,
    };
}

function statsOf(points: ClimatePoint[]): ClimateWindow["stats"] {
    if (points.length === 0) {
        return null;
    }
    const last = points[points.length - 1];
    const metric = (read: (point: ClimatePoint) => number) => {
        const values = points.map(read);
        return {
            last: read(last),
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((sum, value) => sum + value, 0) / values.length,
        };
    };
    return {
        tempC: metric((point) => point.tempC),
        humidityPct: metric((point) => point.humidityPct),
        vpd: metric((point) => point.vpd),
    };
}

function axisOf(times: string[]): [string, string, string] {
    if (times.length === 0) {
        return ["", "", ""];
    }
    const mid = times[Math.floor((times.length - 1) / 2)];
    const label = (t: string) => new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(t));
    return [label(times[0]), label(mid), label(times[times.length - 1])];
}

function windowFromRuns(runs: ClimatePoint[][], raw: ClimatePoint[]): ClimateWindow {
    const flat = runs.flat();
    return {
        axis: axisOf(flat.map((point) => point.t)),
        stats: statsOf(raw),
        runs,
    };
}

function singleRun(points: ClimatePoint[]): ClimatePoint[][] {
    return points.length === 0 ? [] : [points];
}

function bucketed(spans: {start: number; end: number; t: string}[], raw: ClimatePoint[]): ClimateWindow {
    const runs: ClimatePoint[][] = [];
    let current: ClimatePoint[] = [];
    for (let i = 0; i < spans.length; i += 1) {
        const span = spans[i];
        const closedEnd = i === spans.length - 1;
        const inside = raw.filter((point) => inBucket(point, span.start, span.end, closedEnd));
        if (inside.length === 0) {
            if (current.length > 0) {
                runs.push(current);
                current = [];
            }
            continue;
        }
        current.push(mean(inside, span.t));
    }
    if (current.length > 0) {
        runs.push(current);
    }
    return windowFromRuns(runs, raw);
}

function sixHourSpans(nowMs: number): {start: number; end: number; t: string}[] {
    let cursor = berlinDayStartMs(shiftDateOnly(berlinDateOnly(nowMs), -6));
    const spans: {start: number; end: number; t: string}[] = [];
    while (cursor < nowMs) {
        let boundary = cursor;
        for (let step = 0; step < 6; step += 1) {
            boundary = nextBerlinHourBoundary(boundary);
        }
        spans.push({
            start: cursor,
            end: Math.min(boundary, nowMs),
            t: new Date(cursor).toISOString(),
        });
        cursor = boundary;
    }
    return spans;
}

function daySpans(dates: string[], nowMs: number): {start: number; end: number; t: string}[] {
    return dates.map((date) => {
        const start = berlinDayStartMs(date);
        const next = berlinDayStartMs(shiftDateOnly(date, 1));
        return {start, end: Math.min(next, nowMs), t: new Date(start).toISOString()};
    });
}

function datesThrough(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    let date = startDate;
    let guard = 0;
    while (date <= endDate && guard < 4000) {
        dates.push(date);
        date = shiftDateOnly(date, 1);
        guard += 1;
    }
    return dates;
}

function showGrow(seededAt: string): boolean {
    return isDateOnly(seededAt) && seededAt !== EMPTY_SEED;
}

export function buildClimateHistory(
    days: Map<string, ClimateDayFile>,
    nowMs: number,
    seededAt: string,
): ClimateHistoryPublic {
    const today = berlinDateOnly(nowMs);
    const dayAgo = nowMs - 24 * 60 * 60 * 1000;
    const recent = pointsIn(days, dayAgo, nowMs);
    const weekStart = berlinDayStartMs(shiftDateOnly(today, -6));
    const week = pointsIn(days, weekStart, nowMs);
    const monthDates = datesThrough(shiftDateOnly(today, -29), today);
    const monthStart = berlinDayStartMs(monthDates[0]);
    const month = pointsIn(days, monthStart, nowMs);
    const grow = showGrow(seededAt)
        ? bucketed(
            daySpans(datesThrough(seededAt, today), nowMs),
            pointsIn(days, berlinDayStartMs(seededAt), nowMs),
        )
        : null;
    return {
        "24h": windowFromRuns(singleRun(recent), recent),
        "7d": bucketed(sixHourSpans(nowMs), week),
        "30d": bucketed(daySpans(monthDates, nowMs), month),
        grow,
    };
}
