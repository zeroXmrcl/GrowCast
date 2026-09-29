import {chmod, readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {growcastDataDir} from "@/lib/data-paths";
import {mergeMissingEnv, timelapseScheduleFromMesh} from "@/lib/legacy-sidecar-env";
import {timelapseSidecarEnvFile} from "@/lib/timelapse-sidecar-env";

async function readText(filePath: string): Promise<string | null> {
    try {
        return await readFile(filePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

async function writeIfChanged(filePath: string, existing: string, incoming: string): Promise<boolean> {
    const merged = mergeMissingEnv(existing, incoming);
    if (!merged.changed) {
        return false;
    }
    await atomicWriteFile(filePath, merged.text, 0o600);
    await chmod(filePath, 0o600).catch(() => undefined);
    return true;
}

function legacyTimelapseEnvPath(): string {
    return path.join(
        process.cwd(),
        "extensions",
        "GrowCast-Timelapse",
        "GrowCast-Timelapse",
        ".env",
    );
}

/** Fill data/timelapse.env from the pre-compose plugin .env and mesh schedule. Does not replace set keys. */
export async function importLegacyTimelapseEnv(): Promise<boolean> {
    const target = timelapseSidecarEnvFile();
    const existing = (await readText(target)) ?? "";
    const legacy = await readText(legacyTimelapseEnvPath());
    let changed = false;
    if (legacy) {
        changed = await writeIfChanged(target, existing, legacy) || changed;
    }
    const meshPath = path.join(growcastDataDir(), "mesh", "growcast.timelapse.json");
    const meshText = await readText(meshPath);
    if (!meshText) {
        return changed;
    }
    let mesh: unknown;
    try {
        mesh = JSON.parse(meshText) as unknown;
    } catch {
        return changed;
    }
    const schedule = timelapseScheduleFromMesh(mesh);
    const lines = Object.entries(schedule).map(([key, value]) => `${key}=${value}`).join("\n");
    if (!lines) {
        return changed;
    }
    const current = (await readText(target)) ?? "";
    return (await writeIfChanged(target, current, lines)) || changed;
}
