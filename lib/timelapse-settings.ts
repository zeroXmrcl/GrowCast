import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {asBoolean, asNumber, asString, isRecord} from "@/lib/coerce";

export const TIMELAPSE_PLUGIN_ID = "growcast.timelapse";

export type TimelapseQuality = "low" | "medium" | "high";

export type TimelapseSettings = {
    paused: boolean;
    timezone: string;
    time1: string;
    time2: string;
    time3: string;
    intervalMinutes: number | null;
    timelapseLengthSeconds: number;
    timelapseQuality: TimelapseQuality;
};

/** On-disk mesh plugin file shape (stable wire format for GrowCast-Timelapse). */
type TimelapseSettingsFile = {
    lastChanged: string;
    paused: boolean;
    timezone: string;
    time_1: string;
    time_2: string;
    time_3: string;
    interval: number | null;
    timelapseLength: number;
    timelapseQuality: TimelapseQuality;
};

export type TimelapseSettingsRecord = {
    pluginId: string;
    settingsVersion: string;
    settings: TimelapseSettings;
};

export const DEFAULT_TIMELAPSE_SETTINGS: TimelapseSettings = {
    paused: false,
    timezone: "UTC",
    time1: "",
    time2: "",
    time3: "",
    intervalMinutes: null,
    timelapseLengthSeconds: 10,
    timelapseQuality: "medium",
};

const SETTINGS_FILE = path.join(
    process.cwd(),
    "data",
    "mesh",
    `${TIMELAPSE_PLUGIN_ID}.json`,
);

function asOptionalNumber(value: unknown, fallback: number | null): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    return asNumber(value, fallback ?? 0);
}

function normalizePositiveInteger(value: unknown, fallback: number, min = 0): number {
    const normalized = Math.floor(asNumber(value, fallback));
    return normalized >= min ? normalized : fallback;
}

function normalizeOptionalPositiveInteger(value: unknown, fallback: number | null): number | null {
    const normalized = asOptionalNumber(value, fallback);
    if (normalized === null) {
        return null;
    }
    const integer = Math.floor(normalized);
    return integer > 0 ? integer : fallback;
}

function normalizeTime(value: unknown, fallback: string): string {
    const normalized = asString(value, fallback).trim();
    if (normalized.length === 0 || /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
        return normalized;
    }
    return fallback;
}

function normalizeTimeZone(value: unknown, fallback: string): string {
    const normalized = asString(value, fallback).trim();
    try {
        new Intl.DateTimeFormat("en-US", {timeZone: normalized});
        return normalized;
    } catch {
        return fallback;
    }
}

function normalizeQuality(value: unknown, fallback: TimelapseQuality): TimelapseQuality {
    const normalized = asString(value, fallback).trim().toLowerCase();
    if (normalized === "low" || normalized === "medium" || normalized === "high") {
        return normalized;
    }
    return fallback;
}

/**
 * Normalize app or on-disk fields into TimelapseSettings.
 * Accepts camelCase (app) and the stable on-disk keys (time_1, interval, …).
 * Does not accept legacy SCREAMING_SNAKE or random aliases.
 */
export function normalizeTimelapseSettings(
    raw: unknown,
    fallback: TimelapseSettings = DEFAULT_TIMELAPSE_SETTINGS,
): TimelapseSettings {
    const parsed = isRecord(raw) ? raw : {};

    return {
        paused: asBoolean(parsed.paused, fallback.paused),
        timezone: normalizeTimeZone(parsed.timezone, fallback.timezone),
        time1: normalizeTime(parsed.time1 ?? parsed.time_1, fallback.time1),
        time2: normalizeTime(parsed.time2 ?? parsed.time_2, fallback.time2),
        time3: normalizeTime(parsed.time3 ?? parsed.time_3, fallback.time3),
        intervalMinutes: normalizeOptionalPositiveInteger(
            parsed.intervalMinutes ?? parsed.interval,
            fallback.intervalMinutes,
        ),
        timelapseLengthSeconds: normalizePositiveInteger(
            parsed.timelapseLengthSeconds ?? parsed.timelapseLength,
            fallback.timelapseLengthSeconds,
            1,
        ),
        timelapseQuality: normalizeQuality(parsed.timelapseQuality, fallback.timelapseQuality),
    };
}

function toFile(record: TimelapseSettingsRecord): TimelapseSettingsFile {
    return {
        lastChanged: record.settingsVersion,
        paused: record.settings.paused,
        timezone: record.settings.timezone,
        time_1: record.settings.time1,
        time_2: record.settings.time2,
        time_3: record.settings.time3,
        interval: record.settings.intervalMinutes,
        timelapseLength: record.settings.timelapseLengthSeconds,
        timelapseQuality: record.settings.timelapseQuality,
    };
}

function recordFromRaw(raw: unknown): TimelapseSettingsRecord {
    const parsed = isRecord(raw) ? raw : {};
    const settingsVersion = asString(
        parsed.settingsVersion,
        asString(parsed.lastChanged, new Date(0).toISOString()),
    );

    return {
        pluginId: TIMELAPSE_PLUGIN_ID,
        settingsVersion: settingsVersion.length > 0 ? settingsVersion : new Date(0).toISOString(),
        settings: normalizeTimelapseSettings(parsed, DEFAULT_TIMELAPSE_SETTINGS),
    };
}

function createRecord(settings: TimelapseSettings): TimelapseSettingsRecord {
    return {
        pluginId: TIMELAPSE_PLUGIN_ID,
        settingsVersion: new Date().toISOString(),
        settings: normalizeTimelapseSettings(settings, DEFAULT_TIMELAPSE_SETTINGS),
    };
}

async function writeRecord(record: TimelapseSettingsRecord): Promise<void> {
    await mkdir(path.dirname(SETTINGS_FILE), {recursive: true});
    await writeFile(SETTINGS_FILE, JSON.stringify(toFile(record), null, 2), "utf8");
}

export async function getTimelapseSettingsRecord(): Promise<TimelapseSettingsRecord> {
    try {
        const content = await readFile(SETTINGS_FILE, "utf8");
        return recordFromRaw(JSON.parse(content));
    } catch {
        const record = createRecord(DEFAULT_TIMELAPSE_SETTINGS);
        await writeRecord(record);
        return record;
    }
}

export async function getTimelapseSettings(): Promise<TimelapseSettings> {
    const record = await getTimelapseSettingsRecord();
    return record.settings;
}

export async function saveTimelapseSettings(
    settings: TimelapseSettings,
): Promise<TimelapseSettingsRecord> {
    const record = createRecord(settings);
    await writeRecord(record);
    return record;
}

export async function updateTimelapseSettings(
    updates: Partial<TimelapseSettings>,
): Promise<TimelapseSettingsRecord> {
    const current = await getTimelapseSettingsRecord();
    return saveTimelapseSettings({
        ...current.settings,
        ...updates,
    });
}

/** Mesh API: only the known timelapse plugin is registered. */
export function isKnownMeshPlugin(pluginId: string): boolean {
    return pluginId === TIMELAPSE_PLUGIN_ID;
}
