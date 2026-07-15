import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

export type PluginSettingsRecord<TSettings = unknown> = {
    pluginId: string;
    settingsVersion: string;
    settings: TSettings;
};

export type PluginSettingsDefinition<TSettings = unknown> = {
    pluginId: string;
    fileName?: string;
    defaults: TSettings;
    normalize: (raw: unknown, fallback: TSettings) => TSettings;
    getSettingsRoot?: (raw: Record<string, unknown>) => unknown;
    getSettingsVersion?: (raw: Record<string, unknown>) => string | undefined;
    toFile?: (record: PluginSettingsRecord<TSettings>) => unknown;
};

const DATA_DIR = path.join(process.cwd(), "data");
const MESH_SETTINGS_DIR = path.join(DATA_DIR, "mesh");
const DEFAULT_SETTINGS_VERSION = "1970-01-01T00:00:00.000Z";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function createPluginSettingsRecord<TSettings>(
    pluginId: string,
    settings: TSettings,
): PluginSettingsRecord<TSettings> {
    return {
        pluginId,
        settingsVersion: new Date().toISOString(),
        settings,
    };
}

function normalizePluginSettingsRecord<TSettings>(
    definition: PluginSettingsDefinition<TSettings>,
    raw: unknown,
): PluginSettingsRecord<TSettings> {
    const parsed = isRecord(raw) ? raw : {};
    const settingsRoot = definition.getSettingsRoot
        ? definition.getSettingsRoot(parsed)
        : isRecord(parsed.settings)
            ? parsed.settings
            : parsed;
    const settingsVersion = definition.getSettingsVersion?.(parsed)
        ?? asString(parsed.settingsVersion, DEFAULT_SETTINGS_VERSION);

    return {
        pluginId: definition.pluginId,
        settingsVersion: settingsVersion.length > 0 ? settingsVersion : DEFAULT_SETTINGS_VERSION,
        settings: definition.normalize(settingsRoot, definition.defaults),
    };
}

export function getPluginSettingsFilePath<TSettings>(
    definition: PluginSettingsDefinition<TSettings>,
): string {
    return path.join(
        MESH_SETTINGS_DIR,
        definition.fileName ?? `${definition.pluginId}.json`,
    );
}

async function writePluginSettingsRecord<TSettings>(
    definition: PluginSettingsDefinition<TSettings>,
    record: PluginSettingsRecord<TSettings>,
): Promise<void> {
    await mkdir(MESH_SETTINGS_DIR, {recursive: true});
    await writeFile(
        getPluginSettingsFilePath(definition),
        JSON.stringify(definition.toFile ? definition.toFile(record) : record, null, 2),
        "utf8",
    );
}

async function ensurePluginSettingsFile<TSettings>(
    definition: PluginSettingsDefinition<TSettings>,
): Promise<void> {
    try {
        await readFile(getPluginSettingsFilePath(definition), "utf8");
    } catch {
        await writePluginSettingsRecord(
            definition,
            createPluginSettingsRecord(definition.pluginId, definition.defaults),
        );
    }
}

export async function getPluginSettingsRecord<TSettings>(
    definition: PluginSettingsDefinition<TSettings>,
): Promise<PluginSettingsRecord<TSettings>> {
    await ensurePluginSettingsFile(definition);

    try {
        const content = await readFile(getPluginSettingsFilePath(definition), "utf8");
        return normalizePluginSettingsRecord(definition, JSON.parse(content));
    } catch {
        return createPluginSettingsRecord(definition.pluginId, definition.defaults);
    }
}

export async function getPluginSettings<TSettings>(
    definition: PluginSettingsDefinition<TSettings>,
): Promise<TSettings> {
    const record = await getPluginSettingsRecord(definition);

    return record.settings;
}

export async function savePluginSettings<TSettings>(
    definition: PluginSettingsDefinition<TSettings>,
    settings: TSettings,
): Promise<PluginSettingsRecord<TSettings>> {
    const record = createPluginSettingsRecord(
        definition.pluginId,
        definition.normalize(settings, definition.defaults),
    );

    await writePluginSettingsRecord(definition, record);

    return record;
}

export async function updatePluginSettings<TSettings extends object>(
    definition: PluginSettingsDefinition<TSettings>,
    updates: Partial<TSettings>,
): Promise<PluginSettingsRecord<TSettings>> {
    const current = await getPluginSettingsRecord(definition);

    return savePluginSettings(definition, {
        ...current.settings,
        ...updates,
    });
}
