import {chmod, readFile, stat} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {growcastDataDir} from "@/lib/data-paths";

export type SpiderFarmerBrokerStatus = {
    configured: boolean;
    account: string | null;
    serial: string | null;
    pathKind: "file" | "missing" | "directory";
};

export type SpiderFarmerEnvWrite = {
    email: string;
    mqttName: string;
    mqttPwd: string;
    userId: string;
    serial?: string;
    prefix?: string;
    lcSerials?: string;
    meshToken?: string;
};

export function ggsSidecarEnvFile(): string {
    const override = process.env.GROWCAST_GGS_ENV_FILE?.trim();
    if (override) {
        return override;
    }
    return path.join(growcastDataDir(), "ggs.env");
}

function assertEnvToken(value: string): void {
    if (value.length === 0 || /[\r\n\0]/.test(value)) {
        throw new Error("invalid env value");
    }
}

export function mergeGgsSidecarEnv(source: string, values: SpiderFarmerEnvWrite): string {
    assertEnvToken(values.email);
    assertEnvToken(values.mqttName);
    assertEnvToken(values.mqttPwd);
    assertEnvToken(values.userId);
    const updates: Record<string, string> = {
        SF_EMAIL: values.email,
        SF_MQTT_NAME: values.mqttName,
        SF_MQTT_PWD: values.mqttPwd,
        SF_USER_ID: values.userId,
    };
    if (values.serial !== undefined) {
        updates.SF_SERIAL = values.serial;
    }
    if (values.prefix !== undefined) {
        updates.SF_PREFIX = values.prefix;
    }
    if (values.lcSerials !== undefined) {
        updates.SF_LC_SERIALS = values.lcSerials;
    }
    if (values.meshToken !== undefined && values.meshToken.length > 0) {
        updates.GROWCAST_MESH_TOKEN = values.meshToken;
    }
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
        if (key === "SF_PASSWORD") {
            continue;
        }
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

function parseEnv(source: string): Map<string, string> {
    const values = new Map<string, string>();
    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !line.includes("=")) {
            continue;
        }
        const eq = line.indexOf("=");
        values.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
    }
    return values;
}

export function spiderFarmerStatusFromEnv(source: string): SpiderFarmerBrokerStatus {
    const values = parseEnv(source);
    const mqttName = values.get("SF_MQTT_NAME") ?? "";
    const mqttPwd = values.get("SF_MQTT_PWD") ?? "";
    const serial = (values.get("SF_SERIAL") ?? "").trim();
    const account = (values.get("SF_EMAIL") || mqttName || "").trim();
    return {
        configured: mqttName.length > 0 && mqttPwd.length > 0 && serial.length > 0,
        account: account.length > 0 ? account : null,
        serial: serial.length > 0 ? serial : null,
        pathKind: "file",
    };
}

export async function readSpiderFarmerBrokerStatus(
    filePath: string = ggsSidecarEnvFile(),
): Promise<SpiderFarmerBrokerStatus> {
    try {
        const info = await stat(filePath);
        if (info.isDirectory()) {
            return {configured: false, account: null, serial: null, pathKind: "directory"};
        }
        return spiderFarmerStatusFromEnv(await readFile(filePath, "utf8"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {configured: false, account: null, serial: null, pathKind: "missing"};
        }
        throw error;
    }
}

export async function writeSpiderFarmerBrokerEnv(
    values: SpiderFarmerEnvWrite,
    filePath: string = ggsSidecarEnvFile(),
): Promise<void> {
    let source = "";
    try {
        const info = await stat(filePath);
        if (info.isDirectory()) {
            throw new Error("ggs env path is a directory");
        }
        source = await readFile(filePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }
    await atomicWriteFile(filePath, mergeGgsSidecarEnv(source, values), 0o600);
    await chmod(filePath, 0o600).catch(() => undefined);
}
