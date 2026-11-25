"use server";

import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/admin-auth";
import type {AdminActionResult} from "@/lib/admin/action-result";
import {
    DEFAULT_TIMELAPSE_SETTINGS,
    normalizeTimelapseSettings,
    saveTimelapseSettings,
} from "@/plugins/timelapse/host/timelapse-settings";
import {logAdminGrowUpdateFailed, sanitizeError, withNextRequestLogContext} from "@/lib/logging";
import {isRtspUrl, readTimelapseRtsp, writeTimelapseSidecarEnv} from "@/plugins/timelapse/host/timelapse-sidecar-env";

export async function saveTimelapseAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.timelapse", async () => {
        await requireAdmin();
        const submittedRtsp = String(formData.get("rtspStream") ?? "").trim();
        if (submittedRtsp && !isRtspUrl(submittedRtsp)) {
            return {notice: "save_failed"};
        }
        const parsed = normalizeTimelapseSettings(
            {
                paused: formData.get("timelapsePaused") === "on",
                timezone: String(formData.get("timelapseTimezone") ?? DEFAULT_TIMELAPSE_SETTINGS.timezone),
                time1: String(formData.get("timelapseTime1") ?? ""),
                time2: String(formData.get("timelapseTime2") ?? ""),
                time3: String(formData.get("timelapseTime3") ?? ""),
                intervalMinutes: (() => {
                    const text = String(formData.get("timelapseInterval") ?? "").trim();
                    if (!text) {
                        return null;
                    }
                    const n = Number(text);
                    return Number.isFinite(n) ? n : null;
                })(),
                timelapseLengthSeconds: Number(formData.get("timelapseLength") ?? DEFAULT_TIMELAPSE_SETTINGS.timelapseLengthSeconds),
                timelapseQuality: String(formData.get("timelapseQuality") ?? DEFAULT_TIMELAPSE_SETTINGS.timelapseQuality),
            },
            DEFAULT_TIMELAPSE_SETTINGS,
        );
        let settings;
        try {
            settings = (await saveTimelapseSettings(parsed)).settings;
        } catch (error) {
            logAdminGrowUpdateFailed({err: sanitizeError(error)});
            return {notice: "save_failed"};
        }
        const rtsp = submittedRtsp || await readTimelapseRtsp();
        if (rtsp) {
            await writeTimelapseSidecarEnv({
                RTSP_STREAM: rtsp,
                TZ: settings.timezone,
                INTERVAL: settings.intervalMinutes == null ? "" : String(settings.intervalMinutes),
                TIME_1: settings.time1,
                TIME_2: settings.time2,
                TIME_3: settings.time3,
                TIMELAPSE_LENGTH_SECONDS: String(settings.timelapseLengthSeconds),
                TIMELAPSE_QUALITY: settings.timelapseQuality,
            });
        }
        revalidatePath("/p/timelapse/gallery");
        revalidatePath("/admin/plugins/growcast.timelapse");
        return {notice: "saved"};
    });
}
