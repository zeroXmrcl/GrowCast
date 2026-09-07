"use server";

import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {loginAdmin, requireAdmin} from "@/lib/admin-auth";
import {
    parseAdminSettingsForm,
    parseCompleteGrowForm,
    parseStreamSettingsForm,
    parseTimelapseSettingsForm,
} from "@/lib/admin/parse-grow-form";
import {
    saveAdminSettings,
    saveEnergyAdminSettings,
    saveTimelapseAdminSettings,
} from "@/lib/admin/save-settings";
import {parseEnergySettingsForm, readEnergySettings} from "@/lib/energy/settings";
import {withNotice} from "@/lib/admin/notice";
import {completeCurrentGrow} from "@/lib/archives";
import {publishOverlayAlert} from "@/lib/overlay-alert-hub";
import {readAlertsSettings, writeAlertsSettings} from "@/lib/restream/alerts-settings";
import {readRestreamAudio, writeRestreamAudio} from "@/lib/restream/audio";
import {ensureRestreamCaptureToken} from "@/lib/restream/capture";
import {
    hasRestreamKey,
    patchRestreamChannel,
    readRestreamChannel,
    readRestreamKey,
    saveRestreamKey,
    setRestreamEnabled,
    writeRestreamChannel,
} from "@/lib/restream/store";
import {
    isInvalidTypedChannelLogin,
    resolveChannelLogin,
    streamKeyForChannelLookup,
} from "@/lib/restream/twitch-helix";
import {loginRateLimitKey} from "@/lib/request-trust";
import {normalizeOptionalHttpUrl} from "@/lib/url-policy";
import {
    logAdminGrowArchiveFailed,
    logAdminGrowArchived,
    logAdminGrowUpdateFailed,
    logAdminGrowUpdated,
    sanitizeError,
    withNextRequestLogContext,
} from "@/lib/logging";

export async function loginAction(formData: FormData): Promise<void> {
    const h = await headers();
    const clientKey = loginRateLimitKey(h);

    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await loginAdmin(username, password, clientKey);

    if (!result.ok) {
        if (result.code === "rate_limited") {
            redirect(`/admin?error=rate_limited&retry=${result.retryAfterSeconds ?? 900}`);
        }

        if (result.code === "login_disabled") {
            redirect("/admin?error=login_disabled");
        }

        redirect("/admin?error=invalid_credentials");
    }

    redirect("/admin");
}

export async function saveGrowAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        const parsed = parseAdminSettingsForm(formData);
        const result = await saveAdminSettings(parsed);

        if (!result.ok) {
            logAdminGrowUpdateFailed({err: sanitizeError(result.error)});
            redirect(withNotice("/admin", result.error === "stale_grow" ? "stale_grow" : "save_failed"));
        }

        logAdminGrowUpdated();
        revalidatePath("/");
        revalidatePath("/overlay");
        revalidatePath("/admin");
        redirect(withNotice("/admin", "saved"));
    });
}

export async function saveStreamAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();

        const parsed = parseStreamSettingsForm(formData);
        const result = await saveAdminSettings(parsed);

        if (!result.ok) {
            logAdminGrowUpdateFailed({err: sanitizeError(result.error)});
            redirect(
                withNotice("/admin/stream", result.error === "stale_grow" ? "stale_grow" : "save_failed"),
            );
        }

        logAdminGrowUpdated();
        revalidatePath("/");
        revalidatePath("/overlay");
        revalidatePath("/overlay/capture");
        revalidatePath("/program");
        revalidatePath("/admin/stream");
        redirect(withNotice("/admin/stream", "saved"));
    });
}

export async function saveTimelapseAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/timelapse", async () => {
        await requireAdmin();

        const result = await saveTimelapseAdminSettings(parseTimelapseSettingsForm(formData));
        if (!result.ok) {
            logAdminGrowUpdateFailed({err: sanitizeError(result.error)});
            redirect(withNotice("/admin/timelapse", "save_failed"));
        }

        revalidatePath("/gallery");
        revalidatePath("/admin/timelapse");
        redirect(withNotice("/admin/timelapse", "saved"));
    });
}

export async function saveEnergyAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/ggs", async () => {
        await requireAdmin();

        const previousEnergy = await readEnergySettings();
        const energy = parseEnergySettingsForm(formData, previousEnergy);
        if (!energy.ok || energy.settings === undefined) {
            logAdminGrowUpdateFailed({
                err: sanitizeError(energy.ok ? "missing_energy" : energy.error),
            });
            redirect(withNotice("/admin/ggs", "save_failed"));
        }

        const result = await saveEnergyAdminSettings(energy.settings);
        if (!result.ok) {
            logAdminGrowUpdateFailed({err: sanitizeError(result.error)});
            redirect(withNotice("/admin/ggs", "save_failed"));
        }

        revalidatePath("/energy");
        revalidatePath("/overlay");
        revalidatePath("/admin/ggs");
        redirect(withNotice("/admin/ggs", "saved"));
    });
}

export async function saveTwitchKeyAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        const twitchKey = String(formData.get("twitchKey") ?? "");
        const typedLogin = String(formData.get("twitchLogin") ?? "");
        await saveRestreamKey(twitchKey);
        const previous = await readRestreamChannel();
        const login = await resolveChannelLogin({
            typedLogin,
            streamKey: streamKeyForChannelLookup(twitchKey, await readRestreamKey()),
            previousLogin: previous.login,
        });
        await writeRestreamChannel({login, toastEnabled: previous.toastEnabled});
        revalidatePath("/");
        revalidatePath("/admin/stream");
        redirect(
            withNotice(
                "/admin/stream",
                isInvalidTypedChannelLogin(typedLogin, previous.login)
                    ? "twitch_login_invalid"
                    : "twitch_key_saved",
            ),
        );
    });
}

export async function saveBroadcastToastAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        await patchRestreamChannel({toastEnabled: formData.get("toastEnabled") === "on"});
        revalidatePath("/");
        revalidatePath("/admin/stream");
        redirect("/admin/stream");
    });
}

export async function startTwitchRestreamAction(_formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        await ensureRestreamCaptureToken();
        if (!(await hasRestreamKey())) {
            redirect(withNotice("/admin/stream", "twitch_need_key"));
        }
        await setRestreamEnabled(true);
        revalidatePath("/");
        revalidatePath("/admin/stream");
        redirect(withNotice("/admin/stream", "twitch_started"));
    });
}

export async function stopTwitchRestreamAction(_formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        await setRestreamEnabled(false);
        revalidatePath("/");
        revalidatePath("/admin/stream");
        redirect(withNotice("/admin/stream", "twitch_stopped"));
    });
}

export async function saveProgramAudioAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        const existing = await readRestreamAudio();
        const parsedVolume = Number(formData.get("volume"));
        const volume = Math.min(1, Math.max(0, Number.isFinite(parsedVolume) ? parsedVolume : existing.volume));
        await writeRestreamAudio({
            url: existing.url,
            volume,
            paused: formData.get("paused") === "on",
        });
        revalidatePath("/admin/stream");
        revalidatePath("/program");
        revalidatePath("/overlay/capture");
        redirect(withNotice("/admin/stream", "audio_saved"));
    });
}

export async function saveProgramAudioUrlAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        const existing = await readRestreamAudio();
        const raw = String(formData.get("url") ?? formData.get("streamUrl") ?? formData.get("musicUrl") ?? "");
        const url = normalizeOptionalHttpUrl(raw);
        if (url === null) {
            redirect(withNotice("/admin/stream", "save_failed"));
        }
        await writeRestreamAudio({
            url,
            volume: existing.volume,
            paused: existing.paused,
        });
        revalidatePath("/admin/stream");
        revalidatePath("/program");
        revalidatePath("/overlay/capture");
        redirect(withNotice("/admin/stream", "audio_saved"));
    });
}

export async function sendProgramAlertAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        const alertBody = String(formData.get("alertBody") ?? "").trim();
        if (alertBody.length === 0) {
            redirect(withNotice("/admin/stream", "save_failed"));
        }
        publishOverlayAlert(
            {
                id: crypto.randomUUID(),
                kind: "manual",
                title: "Alert",
                body: alertBody,
                createdAt: Date.now(),
            },
            await readAlertsSettings(),
        );
        redirect(withNotice("/admin/stream", "alert_sent"));
    });
}

export async function saveAlertsSettingsAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/stream", async () => {
        await requireAdmin();
        await writeAlertsSettings({
            follow: formData.get("follow") === "on",
            sub: formData.get("sub") === "on",
            raid: formData.get("raid") === "on",
            bits: formData.get("bits") === "on",
            stingEnabled: formData.get("stingEnabled") === "on",
        });
        revalidatePath("/admin/stream");
        revalidatePath("/program");
        revalidatePath("/overlay/capture");
        redirect(withNotice("/admin/stream", "alerts_saved"));
    });
}

export async function completeGrowAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/archives", async () => {
        await requireAdmin();

        if (formData.get("confirmArchive") !== "on") {
            redirect(withNotice("/admin/archives", "archive_not_confirmed"));
        }

        const input = parseCompleteGrowForm(formData);
        const result = await completeCurrentGrow(input);

        if (!result.ok) {
            logAdminGrowArchiveFailed({err: sanitizeError(result.error)});
            redirect(
                withNotice("/admin/archives", result.error === "stale_grow" ? "stale_grow" : "archive_failed"),
            );
        }

        logAdminGrowArchived({
            archiveId: result.archive.archiveId,
            ...(result.warning ? {warning: result.warning} : {}),
        });
        revalidatePath("/");
        revalidatePath("/energy");
        revalidatePath("/gallery");
        revalidatePath("/grows");
        revalidatePath(`/grows/${result.archive.archiveId}`);
        revalidatePath("/admin");
        revalidatePath("/admin/archives");
        const notice =
            result.warning === "reset_failed"
                ? "archived_reset_warning"
                : result.warning === "media_cleanup_failed"
                  ? "archived_cleanup_warning"
                  : "archived";
        redirect(withNotice("/admin/archives", notice));
    });
}
