import type {GrowUpdateInput} from "@/lib/db";
import {
    DEFAULT_TIMELAPSE_SETTINGS,
    normalizeTimelapseSettings,
    type TimelapseSettings,
} from "@/lib/timelapse-settings";
import {normalizeOptionalHttpUrl} from "@/lib/url-policy";

export type AdminSettingsFormResult = {
    grow: GrowUpdateInput;
    timelapse: TimelapseSettings;
};

function fieldString(formData: FormData, name: string, fallback = ""): string {
    return String(formData.get(name) ?? fallback);
}

function toNumber(value: FormDataEntryValue | null, fallback = 0): number {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value: FormDataEntryValue | null): number | null {
    const text = String(value ?? "").trim();
    if (text.length === 0) {
        return null;
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
}

function safeUrl(raw: FormDataEntryValue | null): string {
    const normalized = normalizeOptionalHttpUrl(String(raw ?? ""));
    return normalized ?? "";
}

/**
 * Map admin settings FormData to grow update + normalized timelapse settings.
 * URL fields use http(s)-only policy; timelapse quality goes through normalizeTimelapseSettings.
 */
export function parseAdminSettingsForm(formData: FormData): AdminSettingsFormResult {
    const grow: GrowUpdateInput = {
        name: fieldString(formData, "name"),
        showGrowName: formData.get("showGrowName") === "on",
        plant: fieldString(formData, "plant"),
        plantAmount: toNumber(formData.get("plantAmount"), 0),
        streamUrl: safeUrl(formData.get("streamUrl")),
        details: {
            strain: fieldString(formData, "strain"),
            stage: fieldString(formData, "stage"),
            seededAt: fieldString(formData, "seededAt"),
            lightSchedule: fieldString(formData, "lightSchedule"),
            notes: fieldString(formData, "notes"),
        },
        growSetup: {
            setupText: fieldString(formData, "setupText"),
            growingMedium: fieldString(formData, "growingMedium"),
            potSizeLiters: toNumber(formData.get("potSizeLiters"), 0),
        },
        status: {
            health: fieldString(formData, "health", "Healthy"),
            estimatedHarvestDate: fieldString(formData, "estimatedHarvestDate"),
            notes: fieldString(formData, "statusNotes"),
        },
        climate: {
            temperatureDay: toNumber(formData.get("temperatureDay")),
            temperatureNight: toNumber(formData.get("temperatureNight")),
            humidityDay: toNumber(formData.get("humidityDay")),
            humidityNight: toNumber(formData.get("humidityNight")),
        },
        socials: {
            youtube: safeUrl(formData.get("youtube")),
            twitter: safeUrl(formData.get("twitter")),
            instagram: safeUrl(formData.get("instagram")),
            discordInvite: safeUrl(formData.get("discordInvite")),
            growDiaries: safeUrl(formData.get("growDiaries")),
            customWebsite: safeUrl(formData.get("customWebsite")),
        },
    };

    const timelapse = normalizeTimelapseSettings(
        {
            paused: formData.get("timelapsePaused") === "on",
            timezone: fieldString(
                formData,
                "timelapseTimezone",
                DEFAULT_TIMELAPSE_SETTINGS.timezone,
            ),
            time1: fieldString(formData, "timelapseTime1"),
            time2: fieldString(formData, "timelapseTime2"),
            time3: fieldString(formData, "timelapseTime3"),
            intervalMinutes: toOptionalNumber(formData.get("timelapseInterval")),
            timelapseLengthSeconds: toNumber(
                formData.get("timelapseLength"),
                DEFAULT_TIMELAPSE_SETTINGS.timelapseLengthSeconds,
            ),
            timelapseQuality: fieldString(
                formData,
                "timelapseQuality",
                DEFAULT_TIMELAPSE_SETTINGS.timelapseQuality,
            ),
        },
        DEFAULT_TIMELAPSE_SETTINGS,
    );

    return {grow, timelapse};
}
