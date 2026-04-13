import { promises as fs } from "fs";
import path from "path";

export const TIMELAPSE_PLUGIN_DIR = path.resolve(
    process.cwd(),
    "extensions",
    "GrowCast-Timelapse"
);

export const SNAPSHOT_DIR = path.join(TIMELAPSE_PLUGIN_DIR, "snapshots");
export const TIMELAPSE_DIR = path.join(TIMELAPSE_PLUGIN_DIR, "timelapse");

export async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export async function isTimelapsePluginInstalled(): Promise<boolean> {
    return pathExists(TIMELAPSE_PLUGIN_DIR);
}

export async function getSnapshotFiles(): Promise<string[]> {
    if (!(await pathExists(SNAPSHOT_DIR))) {
        return [];
    }

    const entries = await fs.readdir(SNAPSHOT_DIR, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /\.(webp|jpg|jpeg|png)$/i.test(name))
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
        .filter((name) => /\.(mp4|webm|mov)$/i.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}