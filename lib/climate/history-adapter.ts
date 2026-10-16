import {loadClimatePointsForWindow} from "@/lib/ai-summary/stats";
import {isUsableSeededAt} from "@/lib/ai-summary/stage";
import {
    emptyClimateHistory,
    type ClimateDayFile,
    type ClimateHistoryPublic,
    type ClimateHistoryRange,
    type ClimatePoint,
    type ClimateWindow,
} from "@/lib/climate/history-public";
import {buildClimateHistory, datesThrough, windowFromPoints} from "@/lib/climate/history-windows";
import {readClimateDay} from "@/lib/climate/store";
import type {ClimateDayFile as StoredDayFile, ClimatePoint as StoredPoint} from "@/lib/climate/types";
import {climateRetentionStartDate} from "@/lib/climate/writer";
import {berlinDateOnly, shiftDateOnly} from "@/lib/energy/berlin";

function finiteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toHistoryPoint(point: StoredPoint): ClimatePoint | null {
    const tempC = finiteNumber(point.tempC);
    const humidityPct = finiteNumber(point.humidityPct);
    const vpd = finiteNumber(point.vpd);
    if (tempC === null || humidityPct === null || vpd === null) {
        return null;
    }
    const t = typeof point.t === "string" ? point.t : "";
    if (!t || !Number.isFinite(Date.parse(t))) {
        return null;
    }
    return {t, tempC, humidityPct, vpd};
}

export function adaptStoredDays(days: StoredDayFile[]): Map<string, ClimateDayFile> {
    const adapted = new Map<string, ClimateDayFile>();
    for (const day of days) {
        const points: ClimatePoint[] = [];
        for (const point of day.points) {
            const next = toHistoryPoint(point);
            if (next) {
                points.push(next);
            }
        }
        if (points.length > 0) {
            adapted.set(day.date, {date: day.date, points});
        }
    }
    return adapted;
}

export function seedForHistory(seededAt: string, nowMs: number): string {
    if (!isUsableSeededAt(seededAt)) {
        return seededAt;
    }
    const retainFrom = climateRetentionStartDate(berlinDateOnly(nowMs));
    return seededAt < retainFrom ? retainFrom : seededAt;
}

export function buildClimateHistoryFromStored(
    days: StoredDayFile[],
    nowMs: number,
    seededAt: string,
): ClimateHistoryPublic {
    return buildClimateHistory(adaptStoredDays(days), nowMs, seedForHistory(seededAt, nowMs));
}

export function historyStartDate(nowMs: number, seededAt: string): string {
    const today = berlinDateOnly(nowMs);
    const retainFrom = climateRetentionStartDate(today);
    const monthStart = shiftDateOnly(today, -29);
    let start = monthStart;
    if (isUsableSeededAt(seededAt) && seededAt < start) {
        start = seededAt < retainFrom ? retainFrom : seededAt;
    }
    return start < retainFrom ? retainFrom : start;
}

export async function loadAdaptedHistoryDays(
    nowMs: number,
    seededAt: string,
): Promise<Map<string, ClimateDayFile>> {
    const today = berlinDateOnly(nowMs);
    const start = historyStartDate(nowMs, seededAt);
    const days = new Map<string, ClimateDayFile>();
    for (const date of datesThrough(start, today)) {
        const day = await readClimateDay(date);
        if (!day) {
            continue;
        }
        const points: ClimatePoint[] = [];
        for (const point of day.points) {
            const next = toHistoryPoint(point);
            if (next) {
                points.push(next);
            }
        }
        if (points.length > 0) {
            days.set(day.date, {date: day.date, points});
        }
    }
    return days;
}

export async function build24hWindow(nowMs: number): Promise<ClimateWindow> {
    const startMs = nowMs - 24 * 60 * 60 * 1000;
    const stored = await loadClimatePointsForWindow(startMs, nowMs + 1);
    const recent: ClimatePoint[] = [];
    for (const point of stored) {
        const adapted = toHistoryPoint(point);
        if (!adapted) {
            continue;
        }
        const ms = Date.parse(adapted.t);
        if (Number.isFinite(ms) && ms >= startMs && ms <= nowMs) {
            recent.push(adapted);
        }
    }
    return windowFromPoints(recent);
}

export async function readPublicClimateHistory(input: {
    nowMs?: number;
    seededAt?: string;
    range?: ClimateHistoryRange | "all";
} = {}): Promise<ClimateHistoryPublic> {
    const nowMs = input.nowMs ?? Date.now();
    const seededAt = input.seededAt ?? "";
    const range = input.range ?? "all";
    const history = emptyClimateHistory();

    if (range === "24h" || range === "all") {
        history["24h"] = await build24hWindow(nowMs);
    }
    if (range === "7d" || range === "30d" || range === "grow" || range === "all") {
        const days = await loadAdaptedHistoryDays(nowMs, seededAt);
        const built = buildClimateHistory(days, nowMs, seedForHistory(seededAt, nowMs));
        if (range === "all" || range === "7d") {
            history["7d"] = built["7d"];
        }
        if (range === "all" || range === "30d") {
            history["30d"] = built["30d"];
        }
        if (range === "all" || range === "grow") {
            history.grow = built.grow;
        }
    }
    return history;
}
