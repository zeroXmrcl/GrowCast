import {chmod, readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";

const MANAGED_KEYS = ["SF_EMAIL", "SF_MQTT_NAME", "SF_MQTT_PWD", "SF_USER_ID"] as const;

export type SpiderFarmerBrokerStatus = {
    configured: boolean;
    account: string | null;
};

export type SpiderFarmerEnvWrite = {
    email: string;
    mqttName: string;
    mqttPwd: string;
    userId: string;
};

export function ggsSidecarEnvFile(): string {
    const override = process.env.GROWCAST_GGS_ENV_FILE?.trim();
    if (override) {
        return override;
    }
    return path.join(process.cwd(), "extensions", "GrowCast-GGS", ".env");
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
    for (const key of MANAGED_KEYS) {
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
    const account = (values.get("SF_EMAIL") || mqttName || "").trim();
    return {
        configured: mqttName.length > 0 && mqttPwd.length > 0,
        account: account.length > 0 ? account : null,
    };
}

export async function readSpiderFarmerBrokerStatus(
    filePath: string = ggsSidecarEnvFile(),
): Promise<SpiderFarmerBrokerStatus> {
    try {
        return spiderFarmerStatusFromEnv(await readFile(filePath, "utf8"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {configured: false, account: null};
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
        source = await readFile(filePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }
    await atomicWriteFile(filePath, mergeGgsSidecarEnv(source, values));
    await chmod(filePath, 0o600).catch(() => undefined);
}
