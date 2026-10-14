import {mkdir, readdir, readFile, rm, unlink} from "node:fs/promises";
import {asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {isDateOnly} from "@/lib/date-only";
import {CLIMATE_METRIC_KEYS, type ClimateDayFile, type ClimatePoint} from "@/lib/climate/types";
import {climateCurrentDir, climateDayFile} from "@/lib/climate/paths";
import {logClimate} from "@/lib/climate/log";

const DAY_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;

function optionalFinite(value: unknown): number | null | undefined {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

function parseOptionalDay(value: unknown): boolean | null {
    if (value === true || value === 1 || value === "1") {
        return true;
    }
    if (value === false || value === 0 || value === "0") {
        return false;
    }
    return null;
}

export function parseClimatePoint(raw: unknown): ClimatePoint | null {
    if (!isRecord(raw)) {
        return null;
    }
    const t = asString(raw.t, "").trim();
    if (!t || !Number.isFinite(Date.parse(t))) {
        return null;
    }
    const point: ClimatePoint = {
        t: new Date(Date.parse(t)).toISOString(),
        tempC: null,
        humidityPct: null,
        vpd: null,
        co2: null,
        ppfd: null,
        isDay: parseOptionalDay(raw.isDay),
    };
    for (const key of CLIMATE_METRIC_KEYS) {
        const parsed = optionalFinite(raw[key]);
        if (parsed === undefined) {
            return null;
        }
        point[key] = parsed;
    }
    if (raw.alarm === true) {
        point.alarm = true;
    }
    return point;
}

export function parseClimateDayFile(raw: unknown, fallbackDate: string): ClimateDayFile | null {
    if (!isRecord(raw)) {
        return null;
    }
    const date = asString(raw.date, fallbackDate).trim() || fallbackDate;
    if (!isDateOnly(date)) {
        return null;
    }
    if (!Array.isArray(raw.points)) {
        return null;
    }
    const points: ClimatePoint[] = [];
    for (const item of raw.points) {
        const parsed = parseClimatePoint(item);
        if (parsed) {
            points.push(parsed);
        }
    }
    points.sort((a, b) => a.t.localeCompare(b.t));
    return {date, points};
}

function compactPoint(point: ClimatePoint): ClimatePoint {
    const next: ClimatePoint = {
        t: point.t,
        tempC: point.tempC,
        humidityPct: point.humidityPct,
        vpd: point.vpd,
        co2: point.co2,
        ppfd: point.ppfd,
        isDay: point.isDay,
    };
    if (point.alarm) {
        next.alarm = true;
    }
    return next;
}

export function mergeClimatePoint(day: ClimateDayFile, point: ClimatePoint): ClimateDayFile {
    const compact = compactPoint(point);
    const points = day.points.slice();
    const index = points.findIndex((existing) => existing.t === compact.t);
    if (index === -1) {
        points.push(compact);
        points.sort((a, b) => a.t.localeCompare(b.t));
    } else {
        points[index] = compact;
    }
    return {date: day.date, points};
}

export type ClimateDayInspect =
    | {status: "missing"}
    | {status: "corrupt"}
    | {status: "ok"; day: ClimateDayFile};

export async function inspectClimateDay(dateOnly: string): Promise<ClimateDayInspect> {
    try {
        const raw = JSON.parse(await readFile(climateDayFile(dateOnly), "utf8")) as unknown;
        const parsed = parseClimateDayFile(raw, dateOnly);
        if (!parsed) {
            return {status: "corrupt"};
        }
        if (isRecord(raw) && Array.isArray(raw.points) && raw.points.length !== parsed.points.length) {
            return {status: "corrupt"};
        }
        return {status: "ok", day: parsed};
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {status: "missing"};
        }
        return {status: "corrupt"};
    }
}

export async function readClimateDay(dateOnly: string): Promise<ClimateDayFile | null> {
    const inspected = await inspectClimateDay(dateOnly);
    if (inspected.status === "ok") {
        return inspected.day;
    }
    if (inspected.status === "corrupt") {
        logClimate("corrupt_climate_day", {date: dateOnly});
    }
    return null;
}

export async function writeClimateDay(day: ClimateDayFile): Promise<void> {
    await atomicWriteFile(
        climateDayFile(day.date),
        JSON.stringify({
            date: day.date,
            points: day.points.map(compactPoint),
        }),
    );
}

export async function listCurrentClimateDates(): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(climateCurrentDir(), {withFileTypes: true});
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        logClimate("climate_list_failed");
        return [];
    }
    const dates: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        const match = DAY_FILE_NAME.exec(entry.name);
        if (match) {
            dates.push(match[1]);
        }
    }
    return dates.sort();
}

export async function pruneClimateDays(keepFromDate: string): Promise<number> {
    const dates = await listCurrentClimateDates();
    let removed = 0;
    for (const date of dates) {
        if (date >= keepFromDate) {
            continue;
        }
        try {
            await unlink(climateDayFile(date));
            removed += 1;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                logClimate("climate_prune_failed", {date});
            }
        }
    }
    return removed;
}

export async function resetClimateCurrent(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            await rm(climateCurrentDir(), {recursive: true, force: true});
            await mkdir(climateCurrentDir(), {recursive: true});
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        }
    }
    throw lastError;
}

let writeChain: Promise<unknown> = Promise.resolve();

export function withClimateWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn);
    writeChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

export function _resetClimateWriteLockForTests(): void {
    writeChain = Promise.resolve();
}
