import {promises as fs} from "node:fs";
import path from "node:path";
import {pluginDataDir} from "@/lib/plugins/paths";

export const TIMELAPSE_PLUGIN_DIR = path.resolve(
    process.cwd(),
    "plugins",
    "timelapse"
);

export const TIMELAPSE_PLUGIN_MARKERS = ["Dockerfile", "requirements.txt", "plugin.json"] as const;

export const SNAPSHOT_DIR = path.join(pluginDataDir("growcast.timelapse"), "snapshots");
export const TIMELAPSE_DIR = path.join(pluginDataDir("growcast.timelapse"), "timelapse");
export const LEGACY_SNAPSHOT_DIR = path.join(TIMELAPSE_PLUGIN_DIR, "snapshots");
export const LEGACY_TIMELAPSE_DIR = path.join(TIMELAPSE_PLUGIN_DIR, "timelapse");

function timelapsePluginRoot(): string {
    const override = (process.env.GROWCAST_TIMELAPSE_DIR ?? "").trim();
    return override ? path.resolve(override) : TIMELAPSE_PLUGIN_DIR;
}

export async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function dirHasMatchingFile(dir: string, pattern: RegExp): Promise<boolean> {
    if (!(await pathExists(dir))) {
        return false;
    }
    const entries = await fs.readdir(dir, {withFileTypes: true});
    return entries.some((entry) => entry.isFile() && pattern.test(entry.name));
}

export async function isTimelapsePluginInstalled(): Promise<boolean> {
    const root = timelapsePluginRoot();
    for (const marker of TIMELAPSE_PLUGIN_MARKERS) {
        if (await pathExists(path.join(root, marker))) {
            return true;
        }
    }
    if (await dirHasMatchingFile(path.join(root, "snapshots"), /\.webp$/i)) {
        return true;
    }
    return dirHasMatchingFile(path.join(root, "timelapse"), /\.mp4$/i);
}

async function listMatching(dir: string, pattern: RegExp): Promise<string[]> {
    if (!(await pathExists(dir))) {
        return [];
    }
    const entries = await fs.readdir(dir, {withFileTypes: true});
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => pattern.test(name));
}

export async function getSnapshotFiles(): Promise<string[]> {
    const names = new Set([
        ...await listMatching(SNAPSHOT_DIR, /\.(webp)$/i),
        ...await listMatching(LEGACY_SNAPSHOT_DIR, /\.(webp)$/i),
    ]);
    return [...names].sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
}

export async function getTimelapseFiles(): Promise<string[]> {
    const names = new Set([
        ...await listMatching(TIMELAPSE_DIR, /\.(mp4)$/i),
        ...await listMatching(LEGACY_TIMELAPSE_DIR, /\.(mp4)$/i),
    ]);
    return [...names].filter((name) => !name.toLowerCase().includes(".partial"))
        .sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
}