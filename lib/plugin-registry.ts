import type {PluginSettingsDefinition, PluginSettingsRecord} from "@/lib/plugin-settings-store";

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (normalized === "true") {
            return true;
        }

        if (normalized === "false") {
            return false;
        }
    }

    return fallback;
}

function asNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);

        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return fallback;
}

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

export function normalizeTimelapseSettings(
    raw: unknown,
    fallback: TimelapseSettings = DEFAULT_TIMELAPSE_SETTINGS,
): TimelapseSettings {
    const parsed = isRecord(raw) ? raw : {};

    return {
        paused: asBoolean(parsed.paused ?? parsed.PAUSED, fallback.paused),
        timezone: normalizeTimeZone(parsed.timezone ?? parsed.tz ?? parsed.TZ, fallback.timezone),
        time1: normalizeTime(parsed.time1 ?? parsed.time_1 ?? parsed.TIME_1, fallback.time1),
        time2: normalizeTime(parsed.time2 ?? parsed.time_2 ?? parsed.TIME_2, fallback.time2),
        time3: normalizeTime(parsed.time3 ?? parsed.time_3 ?? parsed.TIME_3, fallback.time3),
        intervalMinutes: normalizeOptionalPositiveInteger(
            parsed.intervalMinutes ?? parsed.interval ?? parsed.INTERVAL,
            fallback.intervalMinutes,
        ),
        timelapseLengthSeconds: normalizePositiveInteger(
            parsed.timelapseLengthSeconds ?? parsed.timelapseLength ?? parsed.TIMELAPSE_LENGTH_SECONDS,
            fallback.timelapseLengthSeconds,
            1,
        ),
        timelapseQuality: normalizeQuality(parsed.timelapseQuality ?? parsed.TIMELAPSE_QUALITY, fallback.timelapseQuality),
    };
}

function toTimelapseSettingsFile(record: PluginSettingsRecord<TimelapseSettings>): TimelapseSettingsFile {
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

export const timelapseSettingsDefinition: PluginSettingsDefinition<TimelapseSettings> = {
    pluginId: TIMELAPSE_PLUGIN_ID,
    defaults: DEFAULT_TIMELAPSE_SETTINGS,
    normalize: normalizeTimelapseSettings,
    getSettingsVersion(raw) {
        return asString(raw.settingsVersion, asString(raw.lastChanged));
    },
    toFile: toTimelapseSettingsFile,
};

const pluginSettingsDefinitions = [
    timelapseSettingsDefinition,
] as const;

export function getPluginSettingsDefinition(pluginId: string): PluginSettingsDefinition<unknown> | undefined {
    const definition = pluginSettingsDefinitions.find((item) => item.pluginId === pluginId);

    return definition as unknown as PluginSettingsDefinition<unknown> | undefined;
}
