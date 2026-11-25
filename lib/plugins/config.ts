import {readFile} from "node:fs/promises";
import {isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {pluginConfigFile, pluginSecretsFile} from "@/lib/plugins/paths";
import type {PluginConfigField, PluginManifest} from "@/lib/plugins/types";

export type PluginConfigValues = Record<string, string | number | boolean>;

function defaultFor(field: PluginConfigField): string | number | boolean | undefined {
    if (field.default !== undefined) {
        return field.default;
    }
    if (field.type === "boolean") {
        return false;
    }
    return undefined;
}

export function stripSecrets(
    manifest: PluginManifest,
    values: PluginConfigValues,
): PluginConfigValues {
    const out: PluginConfigValues = {};
    for (const [key, field] of Object.entries(manifest.config)) {
        if (field.type === "secret") {
            continue;
        }
        if (key in values) {
            out[key] = values[key];
        }
    }
    return out;
}

export async function readPluginSecrets(pluginId: string): Promise<Record<string, string>> {
    try {
        const raw = JSON.parse(await readFile(pluginSecretsFile(pluginId), "utf8")) as unknown;
        if (!isRecord(raw)) {
            return {};
        }
        const secrets: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === "string") {
                secrets[key] = value;
            }
        }
        return secrets;
    } catch {
        return {};
    }
}

export async function readPluginConfig(pluginId: string): Promise<PluginConfigValues> {
    const discovered = await findDiscoveredPlugin(pluginId);
    const defaults: PluginConfigValues = {};
    if (discovered) {
        for (const [key, field] of Object.entries(discovered.manifest.config)) {
            const fallback = defaultFor(field);
            if (fallback !== undefined) {
                defaults[key] = fallback;
            }
        }
    }
    try {
        const raw = JSON.parse(await readFile(pluginConfigFile(pluginId), "utf8")) as unknown;
        if (!isRecord(raw)) {
            return defaults;
        }
        const merged = {...defaults};
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                merged[key] = value;
            }
        }
        return merged;
    } catch {
        return defaults;
    }
}

export async function readPluginConfigForBackend(pluginId: string): Promise<PluginConfigValues> {
    const config = await readPluginConfig(pluginId);
    const secrets = await readPluginSecrets(pluginId);
    return {...config, ...secrets};
}

export async function writePluginConfig(
    pluginId: string,
    manifest: PluginManifest,
    input: Record<string, unknown>,
): Promise<void> {
    const publicValues: PluginConfigValues = {};
    const secrets: Record<string, string> = {...await readPluginSecrets(pluginId)};
    for (const [key, field] of Object.entries(manifest.config)) {
        if (!(key in input) && field.required && defaultFor(field) === undefined) {
            throw new Error(`Missing required config field "${key}"`);
        }
        const raw = key in input ? input[key] : defaultFor(field);
        if (raw === undefined) {
            continue;
        }
        if (field.type === "secret") {
            if (typeof raw === "string" && raw.length > 0) {
                secrets[key] = raw;
            }
            continue;
        }
        if (field.type === "boolean") {
            publicValues[key] = raw === true || raw === "true" || raw === 1;
            continue;
        }
        if (field.type === "integer" || field.type === "number") {
            const n = typeof raw === "number" ? raw : Number(raw);
            if (!Number.isFinite(n)) {
                throw new Error(`Config field "${key}" must be a number`);
            }
            if (field.min !== undefined && n < field.min) {
                throw new Error(`Config field "${key}" is below min ${field.min}`);
            }
            if (field.max !== undefined && n > field.max) {
                throw new Error(`Config field "${key}" is above max ${field.max}`);
            }
            publicValues[key] = field.type === "integer" ? Math.trunc(n) : n;
            continue;
        }
        if (field.type === "enum") {
            const text = String(raw);
            if (field.values && !field.values.includes(text)) {
                throw new Error(`Config field "${key}" is not a valid option`);
            }
            publicValues[key] = text;
            continue;
        }
        publicValues[key] = String(raw);
    }
    await atomicWriteFile(pluginConfigFile(pluginId), `${JSON.stringify(publicValues, null, 2)}\n`, 0o600);
    await atomicWriteFile(pluginSecretsFile(pluginId), `${JSON.stringify(secrets, null, 2)}\n`, 0o600);
}
