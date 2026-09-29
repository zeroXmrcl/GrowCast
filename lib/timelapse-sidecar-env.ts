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

const BLOCKED_RTSP_HOSTS = new Set([
    "localhost",
    "growcast",
    "metadata",
    "metadata.google.internal",
    "host.docker.internal",
]);

/** Loopback, metadata, and this app's own hostname. LAN cameras stay allowed. */
export function isBlockedRtspHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || BLOCKED_RTSP_HOSTS.has(host) || host === "::1" || host === "::" || host === "0.0.0.0") {
        return true;
    }
    if (host.startsWith("fe80:")) {
        return true;
    }
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!match) {
        return false;
    }
    const octets = match.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) {
        return true;
    }
    const [a, b] = octets;
    if (a === 0 || a === 127) {
        return true;
    }
    return a === 169 && b === 254;
}

export function isRtspUrl(value: string): boolean {
    if (!/^rtsp:\/\/\S+$/i.test(value) || /[\r\n\0]/.test(value)) {
        return false;
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return false;
    }
    if (parsed.protocol !== "rtsp:" || !parsed.hostname) {
        return false;
    }
    return !isBlockedRtspHost(parsed.hostname);
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
    await atomicWriteFile(filePath, mergeTimelapseSidecarEnv(source, withToken), 0o600);
    await chmod(filePath, 0o600).catch(() => undefined);
}
