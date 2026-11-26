import {appendFile, mkdir, readdir, readFile, unlink} from "node:fs/promises";
import path from "node:path";
import {isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {pluginSeriesDir} from "@/lib/plugins/paths";

export const PLUGIN_SERIES_INTERVAL_MS = 60_000;
export const PLUGIN_SERIES_RETENTION_DAYS = 180;

export type SeriesSample = {
    t: string;
    metrics: Record<string, number | null>;
};

export type AppendSeriesOptions = {
    /** False when the manifest declares no metrics. Omit to judge the point only. */
    declaredMetrics?: boolean;
    minIntervalMs?: number;
    retentionDays?: number;
};

export type AppendSeriesResult =
    | "written"
    | "skipped-no-metrics"
    | "skipped-empty"
    | "skipped-throttle"
    | "skipped-bad-time";

const writeTail = new Map<string, Promise<void>>();

function enqueue(pluginId: string, job: () => Promise<void>): Promise<void> {
    const previous = writeTail.get(pluginId) ?? Promise.resolve();
    const next = previous.then(job, job);
    writeTail.set(pluginId, next);
    return next;
}

export function pluginSeriesIntervalMs(override?: number): number {
    if (typeof override === "number" && Number.isFinite(override) && override >= 0 && override <= 86_400_000) {
        return override;
    }
    const raw = process.env.GROWCAST_PLUGIN_SERIES_INTERVAL_MS?.trim();
    if (raw && /^\d+$/.test(raw)) {
        const parsed = Number(raw);
        if (parsed >= 0 && parsed <= 86_400_000) {
            return parsed;
        }
    }
    return PLUGIN_SERIES_INTERVAL_MS;
}

export function pluginSeriesRetentionDays(override?: number): number {
    if (typeof override === "number" && Number.isInteger(override) && override >= 1 && override <= 3650) {
        return override;
    }
    const raw = process.env.GROWCAST_PLUGIN_SERIES_RETENTION_DAYS?.trim();
    if (raw && /^\d+$/.test(raw)) {
        const parsed = Number(raw);
        if (parsed >= 1 && parsed <= 3650) {
            return parsed;
        }
    }
    return PLUGIN_SERIES_RETENTION_DAYS;
}

export function shiftDateOnly(date: string, deltaDays: number): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) {
        return date;
    }
    const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays);
    const next = new Date(utc);
    const year = next.getUTCFullYear();
    const month = String(next.getUTCMonth() + 1).padStart(2, "0");
    const day = String(next.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function seriesRetentionStartDate(todayDate: string, retentionDays = PLUGIN_SERIES_RETENTION_DAYS): string {
    return shiftDateOnly(todayDate, -(retentionDays - 1));
}

export function seriesPointHasValues(metrics: Record<string, number | null> | undefined): boolean {
    if (!metrics) {
        return false;
    }
    return Object.values(metrics).some((value) => typeof value === "number" && Number.isFinite(value));
}

function asSeriesPoint(value: unknown): SeriesSample | null {
    if (!isRecord(value) || typeof value.t !== "string" || !isRecord(value.metrics)) {
        return null;
    }
    const metrics: Record<string, number | null> = {};
    for (const [key, metric] of Object.entries(value.metrics)) {
        metrics[key] = typeof metric === "number" && Number.isFinite(metric) ? metric : null;
    }
    return {t: value.t, metrics};
}

function pointsFromJson(text: string): SeriesSample[] | null {
    try {
        const raw = JSON.parse(text) as unknown;
        if (!isRecord(raw) || !Array.isArray(raw.points)) {
            return null;
        }
        return raw.points.map(asSeriesPoint).filter((point): point is SeriesSample => point !== null);
    } catch {
        return null;
    }
}

function pointsFromJsonl(text: string): SeriesSample[] | null {
    const points: SeriesSample[] = [];
    let sawLine = false;
    for (const line of text.split("\n")) {
        if (!line.trim()) {
            continue;
        }
        sawLine = true;
        try {
            const point = asSeriesPoint(JSON.parse(line) as unknown);
            if (point) {
                points.push(point);
            }
        } catch {
            return null;
        }
    }
    return sawLine ? points : [];
}

export function seriesFileIsEmptyMetrics(text: string, kind: "json" | "jsonl"): boolean {
    const points = kind === "json" ? pointsFromJson(text) : pointsFromJsonl(text);
    if (!points || points.length === 0) {
        return false;
    }
    return points.every((point) => !seriesPointHasValues(point.metrics));
}

function throttleFile(pluginId: string): string {
    return path.join(pluginSeriesDir(pluginId), "throttle.json");
}

async function lastWrittenMs(pluginId: string): Promise<number> {
    try {
        const raw = JSON.parse(await readFile(throttleFile(pluginId), "utf8")) as unknown;
        if (isRecord(raw) && typeof raw.lastAtMs === "number" && Number.isFinite(raw.lastAtMs)) {
            return raw.lastAtMs;
        }
    } catch {
        /* first point */
    }
    return Number.NEGATIVE_INFINITY;
}

export async function readSeriesDay(pluginId: string, day: string): Promise<SeriesSample[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return [];
    }
    const dir = pluginSeriesDir(pluginId);
    const points: SeriesSample[] = [];
    try {
        const parsed = pointsFromJson(await readFile(path.join(dir, `${day}.json`), "utf8"));
        if (parsed) {
            points.push(...parsed);
        }
    } catch {
        /* legacy day file is optional */
    }
    try {
        const parsed = pointsFromJsonl(await readFile(path.join(dir, `${day}.jsonl`), "utf8"));
        if (parsed) {
            points.push(...parsed);
        }
    } catch {
        /* jsonl day file is optional */
    }
    return points;
}

export async function pruneSeriesDays(
    pluginId: string,
    todayDate: string,
    retentionDays = pluginSeriesRetentionDays(),
): Promise<string[]> {
    const keepFrom = seriesRetentionStartDate(todayDate, retentionDays);
    const dir = pluginSeriesDir(pluginId);
    let names: string[] = [];
    try {
        names = await readdir(dir);
    } catch {
        return [];
    }
    const removed: string[] = [];
    for (const name of names) {
        const match = /^(\d{4}-\d{2}-\d{2})\.(json|jsonl)$/.exec(name);
        if (!match || match[1] >= keepFrom) {
            continue;
        }
        await unlink(path.join(dir, name));
        removed.push(name);
    }
    return removed;
}

async function appendSeriesPoint(
    pluginId: string,
    observedAt: string,
    metrics: Record<string, number | null>,
    options: AppendSeriesOptions,
): Promise<AppendSeriesResult> {
    if (options.declaredMetrics === false) {
        return "skipped-no-metrics";
    }
    if (!seriesPointHasValues(metrics)) {
        return "skipped-empty";
    }
    const observedMs = Date.parse(observedAt);
    const day = observedAt.slice(0, 10);
    if (!Number.isFinite(observedMs) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return "skipped-bad-time";
    }
    const intervalMs = pluginSeriesIntervalMs(options.minIntervalMs);
    const previous = await lastWrittenMs(pluginId);
    if (observedMs - previous < intervalMs) {
        return "skipped-throttle";
    }
    const dir = pluginSeriesDir(pluginId);
    const line = `${JSON.stringify({t: observedAt, metrics})}\n`;
    await appendFile(path.join(dir, `${day}.jsonl`), line, "utf8");
    await atomicWriteFile(throttleFile(pluginId), `${JSON.stringify({lastAtMs: observedMs})}\n`);
    await pruneSeriesDays(pluginId, day, pluginSeriesRetentionDays(options.retentionDays));
    return "written";
}

export async function appendPluginSeries(
    pluginId: string,
    observedAt: string,
    metrics: Record<string, number | null>,
    options: AppendSeriesOptions = {},
): Promise<AppendSeriesResult> {
    const dir = pluginSeriesDir(pluginId);
    await mkdir(dir, {recursive: true});
    let result: AppendSeriesResult = "skipped-empty";
    await enqueue(pluginId, async () => {
        result = await appendSeriesPoint(pluginId, observedAt, metrics, options);
    });
    return result;
}

export async function listEmptyMetricSeriesFiles(dataDir: string): Promise<string[]> {
    const root = path.join(dataDir, "plugins");
    let plugins: string[] = [];
    try {
        plugins = await readdir(root);
    } catch {
        return [];
    }
    const found: string[] = [];
    for (const pluginId of plugins) {
        const dir = path.join(root, pluginId, "series");
        let names: string[] = [];
        try {
            names = await readdir(dir);
        } catch {
            continue;
        }
        for (const name of names) {
            const match = /^(\d{4}-\d{2}-\d{2})\.(json|jsonl)$/.exec(name);
            if (!match) {
                continue;
            }
            const filePath = path.join(dir, name);
            try {
                const text = await readFile(filePath, "utf8");
                if (seriesFileIsEmptyMetrics(text, match[2] as "json" | "jsonl")) {
                    found.push(filePath);
                }
            } catch {
                /* unreadable files stay */
            }
        }
    }
    return found.sort();
}

export async function removeEmptyMetricSeriesFiles(files: string[]): Promise<string[]> {
    const removed: string[] = [];
    for (const filePath of files) {
        await unlink(filePath);
        removed.push(filePath);
    }
    return removed;
}
