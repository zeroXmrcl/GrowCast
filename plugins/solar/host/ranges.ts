import {valueSolarCost} from "./allocation";

export type SolarRangeId = "live" | "24h" | "7d" | "30d" | "grow";

export type GrowCycleWindow = {
    active: boolean;
    startedAt: string | null;
    endedAt: string | null;
};

export type WattPoint = {
    tMs: number;
    watts: number | null;
};

export type SolarBucketKind = "hour" | "slot6h" | "day";

export type SolarRangeWindow =
    | {ok: true; startMs: number; endMs: number}
    | {ok: false; reason: "no-grow"};

function finite(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function roundKwh(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function roundEur(value: number): number {
    return Math.round(value * 10000) / 10000;
}

export function parseSolarRange(value: string | null | undefined): SolarRangeId {
    if (value === "24h" || value === "7d" || value === "30d" || value === "grow" || value === "live") {
        return value;
    }
    return "live";
}

export function zonedMidnightMs(dateOnly: string, timeZone: string): number {
    const [year, month, day] = dateOnly.split("-").map(Number);
    let guess = Date.UTC(year, month - 1, day, 0, 0, 0);
    for (let i = 0; i < 4; i += 1) {
        const parts = zonedParts(guess, timeZone);
        const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
        const wanted = Date.UTC(year, month - 1, day, 0, 0, 0);
        guess += wanted - asUtc;
    }
    return guess;
}

function zonedParts(ms: number, timeZone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
} {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return {
        year: read("year"),
        month: read("month"),
        day: read("day"),
        hour: read("hour"),
        minute: read("minute"),
        second: read("second"),
    };
}

export function rangeWindowMs(
    range: SolarRangeId,
    nowMs: number,
    grow: GrowCycleWindow,
    timeZone: string,
): SolarRangeWindow {
    if (range === "live") {
        return {ok: true, startMs: nowMs, endMs: nowMs};
    }
    if (range === "grow") {
        if (!grow.active || !grow.startedAt) {
            return {ok: false, reason: "no-grow"};
        }
        const startMs = zonedMidnightMs(grow.startedAt, timeZone);
        const endMs = grow.endedAt ? zonedMidnightMs(grow.endedAt, timeZone) + 24 * 3_600_000 : nowMs;
        return {ok: true, startMs, endMs: Math.min(endMs, nowMs)};
    }
    const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
    return {ok: true, startMs: nowMs - hours * 3_600_000, endMs: nowMs};
}

export function integrateWattsToKwh(
    points: WattPoint[],
    startMs: number,
    endMs: number,
): number | null {
    if (endMs <= startMs) {
        return null;
    }
    const sorted = points
        .filter((point) => point.tMs >= startMs && point.tMs <= endMs)
        .sort((a, b) => a.tMs - b.tMs);
    let energyWh = 0;
    let any = false;
    for (let i = 0; i < sorted.length - 1; i += 1) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (!finite(a.watts) || !finite(b.watts) || b.tMs <= a.tMs) {
            continue;
        }
        const hours = (b.tMs - a.tMs) / 3_600_000;
        energyWh += ((a.watts + b.watts) / 2) * hours;
        any = true;
    }
    return any ? roundKwh(energyWh / 1000) : null;
}

export function bucketKindFor(range: SolarRangeId, spanMs: number): SolarBucketKind {
    if (range === "24h" || spanMs <= 36 * 3_600_000) {
        return "hour";
    }
    if (range === "7d" || spanMs <= 8 * 24 * 3_600_000) {
        return "slot6h";
    }
    return "day";
}

export function listBucketStarts(startMs: number, endMs: number, kind: SolarBucketKind, timeZone: string): number[] {
    if (endMs <= startMs) {
        return [];
    }
    const first = floorBucketMs(startMs, kind, timeZone);
    const step = kind === "hour" ? 3_600_000 : kind === "slot6h" ? 6 * 3_600_000 : 24 * 3_600_000;
    const starts: number[] = [];
    for (let t = first; t < endMs; t += step) {
        starts.push(t);
    }
    return starts;
}

export function floorBucketMs(tMs: number, kind: SolarBucketKind, timeZone: string): number {
    const parts = zonedParts(tMs, timeZone);
    const dateOnly = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    const midnight = zonedMidnightMs(dateOnly, timeZone);
    if (kind === "day") {
        return midnight;
    }
    if (kind === "slot6h") {
        return midnight + Math.floor(parts.hour / 6) * 6 * 3_600_000;
    }
    return midnight + parts.hour * 3_600_000;
}

export function averageWattsInBucket(points: WattPoint[], startMs: number, endMs: number): number | null {
    const values = points
        .filter((point) => point.tMs >= startMs && point.tMs < endMs && finite(point.watts))
        .map((point) => point.watts as number);
    if (values.length === 0) {
        return null;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function solarKwhValueEur(mode: unknown, feedInTariff: unknown): number | null {
    if (mode === "feed-in") {
        const value = typeof feedInTariff === "number" ? feedInTariff : Number(feedInTariff);
        return finite(value) ? value : null;
    }
    return 0;
}

export type TentSavings = {
    tentFromSolarKwh: number | null;
    tentFromGridKwh: number | null;
    tentKwh: number | null;
    tentSolarEur: number | null;
    tentGridEur: number | null;
    tentTotalEur: number | null;
    gridOnlyEur: number | null;
    savingsEur: number | null;
    solarKwhValueEur: number | null;
    gridTariffEurPerKwh: number | null;
};

export function tentSavings(input: {
    tentFromSolarKwh: number | null;
    tentFromGridKwh: number | null;
    solarKwhValueEur: number | null;
    gridTariffEurPerKwh: number | null;
}): TentSavings {
    const cost = valueSolarCost(input);
    const tentKwh = finite(input.tentFromSolarKwh) && finite(input.tentFromGridKwh)
        ? roundKwh(input.tentFromSolarKwh + input.tentFromGridKwh)
        : null;
    const gridOnlyEur = finite(tentKwh) && finite(input.gridTariffEurPerKwh)
        ? roundEur(tentKwh * input.gridTariffEurPerKwh)
        : null;
    const savingsEur = finite(gridOnlyEur) && finite(cost.tentTotalEur)
        ? roundEur(gridOnlyEur - cost.tentTotalEur)
        : null;
    return {
        tentFromSolarKwh: input.tentFromSolarKwh,
        tentFromGridKwh: input.tentFromGridKwh,
        tentKwh,
        tentSolarEur: cost.tentSolarEur,
        tentGridEur: cost.tentGridEur,
        tentTotalEur: cost.tentTotalEur,
        gridOnlyEur,
        savingsEur,
        solarKwhValueEur: input.solarKwhValueEur,
        gridTariffEurPerKwh: input.gridTariffEurPerKwh,
    };
}

export function daysInMsRange(startMs: number, endMs: number, timeZone: string): string[] {
    const days: string[] = [];
    const start = zonedParts(startMs, timeZone);
    const end = zonedParts(endMs, timeZone);
    let cursor = `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`;
    const last = `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`;
    while (cursor <= last) {
        days.push(cursor);
        const next = zonedMidnightMs(cursor, timeZone) + 36 * 3_600_000;
        const parts = zonedParts(next, timeZone);
        cursor = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        if (days.length > 400) {
            break;
        }
    }
    return days;
}
