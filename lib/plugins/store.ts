import {mkdir, readFile, readdir} from "node:fs/promises";
import path from "node:path";
import {isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {
    pluginCountersFile,
    pluginDataDir,
    pluginHeartbeatFile,
    pluginSeriesDir,
    pluginStateFile,
} from "@/lib/plugins/paths";
import {
    PLUGIN_STALE_AFTER_MS,
    type PluginHeartbeat,
    type PluginLiveMetric,
    type PluginLiveState,
    type PluginManifest,
    type PluginSeriesPoint,
} from "@/lib/plugins/types";

export type StoredMetric = {
    value: number;
    observedAt: string;
};

export type PluginStateFile = {
    pluginId: string;
    observedAt: string;
    metrics: Record<string, StoredMetric>;
    state: Record<string, unknown> | null;
};

export type PluginCounterFile = {
    values: Record<string, {value: number; observedAt: string; origin: number}>;
};

export async function readPluginState(pluginId: string): Promise<PluginStateFile | null> {
    try {
        const raw = JSON.parse(await readFile(pluginStateFile(pluginId), "utf8")) as unknown;
        if (!isRecord(raw) || raw.pluginId !== pluginId || typeof raw.observedAt !== "string") {
            return null;
        }
        return raw as PluginStateFile;
    } catch {
        return null;
    }
}

export async function writePluginState(file: PluginStateFile): Promise<void> {
    await mkdir(pluginDataDir(file.pluginId), {recursive: true});
    await atomicWriteFile(pluginStateFile(file.pluginId), `${JSON.stringify(file)}\n`);
}

export async function readPluginCounters(pluginId: string): Promise<PluginCounterFile> {
    try {
        const raw = JSON.parse(await readFile(pluginCountersFile(pluginId), "utf8")) as unknown;
        if (!isRecord(raw) || !isRecord(raw.values)) {
            return {values: {}};
        }
        return raw as PluginCounterFile;
    } catch {
        return {values: {}};
    }
}

export async function writePluginCounters(pluginId: string, file: PluginCounterFile): Promise<void> {
    await atomicWriteFile(pluginCountersFile(pluginId), `${JSON.stringify(file)}\n`);
}

export async function writePluginHeartbeat(pluginId: string, heartbeat: PluginHeartbeat): Promise<void> {
    await mkdir(pluginDataDir(pluginId), {recursive: true});
    await atomicWriteFile(pluginHeartbeatFile(pluginId), `${JSON.stringify(heartbeat)}\n`);
}

export async function readPluginHeartbeat(pluginId: string): Promise<PluginHeartbeat | null> {
    try {
        const raw = JSON.parse(await readFile(pluginHeartbeatFile(pluginId), "utf8")) as unknown;
        if (!isRecord(raw) || typeof raw.ok !== "boolean" || typeof raw.at !== "string") {
            return null;
        }
        return raw as PluginHeartbeat;
    } catch {
        return null;
    }
}

function liveMetrics(
    manifest: PluginManifest,
    stored: PluginStateFile | null,
    stale: boolean,
): Record<string, PluginLiveMetric> {
    const metrics: Record<string, PluginLiveMetric> = {};
    for (const [key, spec] of Object.entries(manifest.metrics)) {
        const sample = stored?.metrics[key];
        metrics[key] = {
            value: sample ? sample.value : null,
            unit: spec.unit,
            kind: spec.kind,
            stale,
        };
    }
    return metrics;
}

export async function readPluginLive(pluginId: string, nowMs = Date.now()): Promise<PluginLiveState> {
    const discovered = await findDiscoveredPlugin(pluginId);
    const stored = await readPluginState(pluginId);
    const observedAt = stored?.observedAt ?? null;
    const age = observedAt ? nowMs - Date.parse(observedAt) : Number.POSITIVE_INFINITY;
    const stale = !Number.isFinite(age) || age > PLUGIN_STALE_AFTER_MS;
    return {
        pluginId,
        observedAt,
        stale,
        metrics: discovered ? liveMetrics(discovered.manifest, stored, stale) : {},
        state: stored?.state ?? null,
    };
}

export async function appendPluginSeries(
    pluginId: string,
    observedAt: string,
    metrics: Record<string, number | null>,
): Promise<void> {
    const day = observedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return;
    }
    const dir = pluginSeriesDir(pluginId);
    await mkdir(dir, {recursive: true});
    const filePath = path.join(dir, `${day}.json`);
    let points: Array<{t: string; metrics: Record<string, number | null>}> = [];
    try {
        const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
        if (isRecord(raw) && Array.isArray(raw.points)) {
            points = raw.points as typeof points;
        }
    } catch {
        points = [];
    }
    points.push({t: observedAt, metrics});
    await atomicWriteFile(filePath, `${JSON.stringify({date: day, points})}\n`);
}

export async function readPluginSeries(
    pluginId: string,
    keys: string[],
    days: string[],
): Promise<Record<string, PluginSeriesPoint[]>> {
    const dir = pluginSeriesDir(pluginId);
    const out: Record<string, PluginSeriesPoint[]> = {};
    for (const key of keys) {
        out[key] = [];
    }
    let files: string[] = [];
    try {
        files = await readdir(dir);
    } catch {
        return out;
    }
    const wanted = new Set(days);
    for (const name of files.sort()) {
        const day = name.replace(/\.json$/, "");
        if (!wanted.has(day)) {
            continue;
        }
        try {
            const raw = JSON.parse(await readFile(path.join(dir, name), "utf8")) as unknown;
            if (!isRecord(raw) || !Array.isArray(raw.points)) {
                continue;
            }
            for (const point of raw.points) {
                if (!isRecord(point) || typeof point.t !== "string" || !isRecord(point.metrics)) {
                    continue;
                }
                for (const key of keys) {
                    const value = point.metrics[key];
                    out[key].push({
                        t: point.t,
                        value: typeof value === "number" && Number.isFinite(value) ? value : null,
                    });
                }
            }
        } catch {
            /* skip corrupt day file */
        }
    }
    return out;
}

export function counterDelta(previous: number | undefined, next: number): {delta: number | null; reset: boolean} {
    if (previous === undefined) {
        return {delta: null, reset: false};
    }
    if (next < previous) {
        return {delta: null, reset: true};
    }
    return {delta: next - previous, reset: false};
}
