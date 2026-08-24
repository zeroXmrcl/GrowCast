import {readdir} from "node:fs/promises";
import path from "node:path";
import {getCurrentGrow} from "@/lib/db";
import {SNAPSHOT_DIR, pathExists} from "@/lib/extension-status";
import {IMAGE_EXTENSIONS} from "@/lib/safe-media-filename";
import {withStale} from "@/lib/ggs-live";
import {readGgsLive} from "@/lib/ggs-live-store";
import {
    climateMetrics,
    formatHumidityPct,
    formatTempC,
    shouldShowLiveRow,
} from "@/lib/live-climate-view";
import {
    listMediaFiles,
    mediaCollectionDir,
    type MediaCollectionId,
} from "@/lib/media-library";
import {getDaysSince} from "@/utils/daysSinceSeeding";

export type ShareCardClimate = {
    tempC: number | null;
    humidityPct: number | null;
};

export type ShareCardCopy = {
    title: string;
    plant: string;
    stats: string;
    description: string;
    host: string;
};

export type ShareCardStill = {
    kind: "snapshot" | "dashboard" | "setup";
    name: string;
};

export function stillImageMime(name: string): "image/jpeg" | "image/png" | "image/webp" | null {
    switch (path.extname(name).toLowerCase()) {
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".png":
            return "image/png";
        case ".webp":
            return "image/webp";
        default:
            return null;
    }
}

export function publicHostFromHeaders(
    hostHeader: string | null | undefined,
    forwardedHost: string | null | undefined,
): string {
    const raw = (forwardedHost || hostHeader || "").split(",")[0].trim().toLowerCase();
    if (!raw) {
        return "";
    }
    return raw.replace(/:(80|443)$/, "");
}

export function shareCardVisibleHost(host: string): string {
    const value = host.trim().toLowerCase();
    if (!value) {
        return "";
    }
    if (
        value.startsWith("localhost") ||
        value.startsWith("127.") ||
        /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(value)
    ) {
        return "";
    }
    return host;
}

export function buildShareCardCopy(input: {
    plant: string;
    daysSince: number | null;
    climate: ShareCardClimate | null;
    host: string;
}): ShareCardCopy {
    const plant = input.plant.trim() || "Plants";
    const parts: string[] = [];
    if (input.daysSince !== null) {
        parts.push(`Day ${input.daysSince}`);
    }
    if (input.climate) {
        const temp = formatTempC(input.climate.tempC);
        const humidity = formatHumidityPct(input.climate.humidityPct);
        if (temp !== "—") {
            parts.push(temp);
        }
        if (humidity !== "—") {
            parts.push(humidity);
        }
    }
    const stats = parts.join(" · ");
    const descriptionParts = ["Live tent", plant];
    if (input.daysSince !== null) {
        descriptionParts.push(`Day ${input.daysSince}`);
    }
    if (input.climate) {
        const temp = formatTempC(input.climate.tempC);
        if (temp !== "—") {
            descriptionParts.push(temp);
        }
    }
    return {
        title: "GrowCast",
        plant,
        stats,
        description: descriptionParts.join(" · "),
        host: input.host,
    };
}

export function pickShareCardStill(lists: {
    snapshots: string[];
    dashboard: string[];
    setup: string[];
}): ShareCardStill | null {
    if (lists.snapshots[0]) {
        return {kind: "snapshot", name: lists.snapshots[0]};
    }
    const dashboard = lists.dashboard[lists.dashboard.length - 1];
    if (dashboard) {
        return {kind: "dashboard", name: dashboard};
    }
    const setup = lists.setup[lists.setup.length - 1];
    if (setup) {
        return {kind: "setup", name: setup};
    }
    return null;
}

export function shareCardStillPath(still: ShareCardStill): string {
    if (still.kind === "snapshot") {
        return path.join(SNAPSHOT_DIR, still.name);
    }
    const collection: MediaCollectionId = still.kind;
    return path.join(mediaCollectionDir(collection), still.name);
}

export async function loadShareCardCopy(host: string): Promise<ShareCardCopy> {
    const grow = await getCurrentGrow();
    const daysSince = grow.details.seededAt ? getDaysSince(grow.details.seededAt) : null;
    let climate: ShareCardClimate | null = null;
    const stored = await readGgsLive();
    if (stored) {
        const snapshot = withStale(stored);
        if (shouldShowLiveRow(snapshot)) {
            climate = climateMetrics(snapshot);
        }
    }
    return buildShareCardCopy({
        plant: grow.plant,
        daysSince,
        climate,
        host,
    });
}

async function listSnapshotImageNames(): Promise<string[]> {
    if (!(await pathExists(SNAPSHOT_DIR))) {
        return [];
    }
    const entries = await readdir(SNAPSHOT_DIR, {withFileTypes: true});
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
        .sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
}

export async function resolveShareCardStill(): Promise<ShareCardStill | null> {
    const [snapshots, dashboard, setup] = await Promise.all([
        listSnapshotImageNames(),
        listMediaFiles("dashboard"),
        listMediaFiles("setup"),
    ]);
    return pickShareCardStill({
        snapshots,
        dashboard: dashboard.map((file) => file.name),
        setup: setup.map((file) => file.name),
    });
}
