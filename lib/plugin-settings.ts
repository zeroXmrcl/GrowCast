import {
    getPluginSettings,
    getPluginSettingsFilePath,
    getPluginSettingsRecord,
    savePluginSettings,
    updatePluginSettings,
    type PluginSettingsRecord,
} from "@/lib/plugin-settings-store";
import {
    DEFAULT_TIMELAPSE_SETTINGS,
    TIMELAPSE_PLUGIN_ID,
    timelapseSettingsDefinition,
    type TimelapseQuality,
    type TimelapseSettings,
} from "@/lib/plugin-registry";

export {
    DEFAULT_TIMELAPSE_SETTINGS,
    TIMELAPSE_PLUGIN_ID,
    type TimelapseQuality,
    type TimelapseSettings,
};

export type TimelapseSettingsRecord = PluginSettingsRecord<TimelapseSettings>;
export type TimelapseSettingsUpdate = Partial<TimelapseSettings>;

export const TIMELAPSE_SETTINGS_FILE = getPluginSettingsFilePath(timelapseSettingsDefinition);

export async function getTimelapseSettingsRecord(): Promise<TimelapseSettingsRecord> {
    return getPluginSettingsRecord(timelapseSettingsDefinition);
}

export async function getTimelapseSettings(): Promise<TimelapseSettings> {
    return getPluginSettings(timelapseSettingsDefinition);
}

export async function saveTimelapseSettings(settings: TimelapseSettings): Promise<TimelapseSettingsRecord> {
    return savePluginSettings(timelapseSettingsDefinition, settings);
}

export async function updateTimelapseSettings(
    updates: TimelapseSettingsUpdate,
): Promise<TimelapseSettingsRecord> {
    return updatePluginSettings(timelapseSettingsDefinition, updates);
}
