import type {ArchiveEditInput, CompleteGrowInput} from "@/lib/archives";
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
    expectedGrowId?: string;
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

export function parseAdminSettingsForm(formData: FormData): AdminSettingsFormResult {
    const grow: GrowUpdateInput = {
        name: fieldString(formData, "name"),
        showGrowName: formData.get("showGrowName") === "on",
        showSettingsLink: formData.get("showSettingsLink") === "on",
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
            notes: fieldString(formData, "statusNotes"),
            ...(formData.has("estimatedHarvestDate")
                ? {estimatedHarvestDate: fieldString(formData, "estimatedHarvestDate")}
                : {}),
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

    const expectedGrowId = fieldString(formData, "growId").trim();
    return {
        grow,
        timelapse,
        ...(expectedGrowId.length > 0 ? {expectedGrowId} : {}),
    };
}

export function parseCompleteGrowForm(formData: FormData): CompleteGrowInput {
    const expectedGrowId = fieldString(formData, "growId").trim();
    return {
        harvestedAt: fieldString(formData, "harvestedAt"),
        yieldGrams: toOptionalNumber(formData.get("yieldGrams")),
        finalNotes: fieldString(formData, "finalNotes"),
        ...(expectedGrowId.length > 0 ? {expectedGrowId} : {}),
    };
}

export function parseArchiveEditForm(formData: FormData): ArchiveEditInput {
    return {
        name: fieldString(formData, "name"),
        plant: fieldString(formData, "plant"),
        strain: fieldString(formData, "strain"),
        seededAt: fieldString(formData, "seededAt"),
        harvestedAt: fieldString(formData, "harvestedAt"),
        yieldGrams: toOptionalNumber(formData.get("yieldGrams")),
        finalNotes: fieldString(formData, "finalNotes"),
    };
}
