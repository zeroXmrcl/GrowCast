import { promises as fs } from "fs";
import path from "path";

export const TIMELAPSE_PLUGIN_DIR = path.resolve(
    process.cwd(),
    "extensions",
    "GrowCast-Timelapse"
);

export const TIMELAPSE_PLUGIN_MARKERS = ["Dockerfile", "requirements.txt", "plugin.json"] as const;

export const SNAPSHOT_DIR = path.join(TIMELAPSE_PLUGIN_DIR, "snapshots");
export const TIMELAPSE_DIR = path.join(TIMELAPSE_PLUGIN_DIR, "timelapse");

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

export async function getSnapshotFiles(): Promise<string[]> {
    if (!(await pathExists(SNAPSHOT_DIR))) {
        return [];
    }

    const entries = await fs.readdir(SNAPSHOT_DIR, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /\.(webp)$/i.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export async function getTimelapseFiles(): Promise<string[]> {
    if (!(await pathExists(TIMELAPSE_DIR))) {
        return [];
    }

    const entries = await fs.readdir(TIMELAPSE_DIR, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /\.(mp4)$/i.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}