import {readdir, readFile, rm} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import {berlinDateOnly} from "@/lib/energy/berlin";
import {climateCurrentDir, climateDayFile} from "@/lib/climate/paths";
import type {ClimateDayFile, ClimatePoint} from "@/lib/climate/types";

let chain: Promise<void> = Promise.resolve();

export function _resetClimateLockForTests(): void {
    chain = Promise.resolve();
}

function withClimateLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
}

export function isClimatePoint(value: ClimatePoint): boolean {
    const ms = Date.parse(value.t);
    return Number.isFinite(ms)
        && Number.isFinite(value.tempC)
        && Number.isFinite(value.humidityPct)
        && Number.isFinite(value.vpd);
}

function parseDay(raw: unknown, date: string): ClimateDayFile {
    if (!raw || typeof raw !== "object") {
        return {date, points: []};
    }
    const points = (raw as {points?: unknown}).points;
    if (!Array.isArray(points)) {
        return {date, points: []};
    }
    return {
        date,
        points: points.filter((point): point is ClimatePoint => {
            if (!point || typeof point !== "object") {
                return false;
            }
            const row = point as ClimatePoint;
            return isClimatePoint(row);
        }),
    };
}

async function readDay(date: string): Promise<ClimateDayFile> {
    try {
        const raw = JSON.parse(await readFile(climateDayFile(date), "utf8")) as unknown;
        return parseDay(raw, date);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {date, points: []};
        }
        throw error;
    }
}

export async function readClimateDays(): Promise<Map<string, ClimateDayFile>> {
    const days = new Map<string, ClimateDayFile>();
    let names: string[] = [];
    try {
        names = await readdir(climateCurrentDir());
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return days;
        }
        throw error;
    }
    for (const name of names) {
        if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
            continue;
        }
        const date = name.slice(0, 10);
        days.set(date, await readDay(date));
    }
    return days;
}

export async function mergeClimatePoints(points: ClimatePoint[]): Promise<void> {
    const accepted = points.filter(isClimatePoint);
    if (accepted.length === 0) {
        return;
    }
    await withClimateLock(async () => {
        const byDate = new Map<string, ClimatePoint[]>();
        for (const point of accepted) {
            const date = berlinDateOnly(Date.parse(point.t));
            const list = byDate.get(date) ?? [];
            list.push(point);
            byDate.set(date, list);
        }
        for (const [date, incoming] of byDate) {
            const existing = await readDay(date);
            const merged = new Map<string, ClimatePoint>();
            for (const point of existing.points) {
                merged.set(point.t, point);
            }
            for (const point of incoming) {
                merged.set(point.t, point);
            }
            const file: ClimateDayFile = {
                date,
                points: [...merged.values()].sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0),
            };
            await atomicWriteFile(climateDayFile(date), JSON.stringify(file));
        }
    });
}

export async function resetClimateCurrent(): Promise<void> {
    await withClimateLock(async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
                await rm(climateCurrentDir(), {recursive: true, force: true});
                return;
            } catch (error) {
                lastError = error;
                await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
            }
        }
        throw lastError;
    });
}
