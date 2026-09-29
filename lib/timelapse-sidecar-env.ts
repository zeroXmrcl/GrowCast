import {chmod, readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {growcastDataDir} from "@/lib/data-paths";
import {ensureMeshToken} from "@/lib/mesh-token";

export function timelapseSidecarEnvFile(): string {
    const override = process.env.GROWCAST_TIMELAPSE_ENV_FILE?.trim();
    if (override) {
        return override;
    }
    return path.join(growcastDataDir(), "timelapse.env");
}

function parseEnv(source: string): Map<string, string> {
    const values = new Map<string, string>();
    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !line.includes("=")) {
            continue;
        }
        const eq = line.indexOf("=");
        values.set(line.slice(0, eq).trim(), line.slice(eq + 1));
    }
    return values;
}

export function mergeTimelapseSidecarEnv(source: string, updates: Record<string, string>): string {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !line.includes("=")) {
            if (line.length > 0 || next.length > 0) {
                next.push(line);
            }
            continue;
        }
        const key = line.slice(0, line.indexOf("=")).trim();
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            next.push(`${key}=${updates[key]}`);
            continue;
        }
        next.push(line);
    }
    for (const key of Object.keys(updates)) {
        if (!seen.has(key)) {
            next.push(`${key}=${updates[key]}`);
        }
    }
    while (next.length > 0 && next[next.length - 1] === "") {
        next.pop();
    }
    return `${next.join("\n")}\n`;
}

export async function readTimelapseRtsp(
    filePath: string = timelapseSidecarEnvFile(),
): Promise<string> {
    try {
        const values = parseEnv(await readFile(filePath, "utf8"));
        return (values.get("RTSP_STREAM") ?? "").trim();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return "";
        }
        throw error;
    }
}

export function isRtspUrl(value: string): boolean {
    return /^rtsp:\/\/\S+$/i.test(value) && !/[\r\n\0]/.test(value);
}

export async function writeTimelapseSidecarEnv(
    updates: Record<string, string>,
    filePath: string = timelapseSidecarEnvFile(),
): Promise<void> {
    for (const value of Object.values(updates)) {
        if (/[\r\n\0]/.test(value)) {
            throw new Error("invalid env value");
        }
    }
    const meshToken = await ensureMeshToken();
    const withToken = {
        ...updates,
        GROWCAST_MESH_TOKEN: meshToken,
        API_TOKEN: meshToken,
    };
    let source = "";
    try {
        source = await readFile(filePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }
    await atomicWriteFile(filePath, mergeTimelapseSidecarEnv(source, withToken));
    await chmod(filePath, 0o600).catch(() => undefined);
}
