import {getTimelapseSettingsRecord} from "@/plugins/timelapse/host/timelapse-settings";

export async function meshSettings(): Promise<Record<string, unknown>> {
    return getTimelapseSettingsRecord() as unknown as Record<string, unknown>;
}
