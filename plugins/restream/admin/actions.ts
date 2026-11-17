"use server";

import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/admin-auth";
import type {AdminActionResult} from "@/lib/admin/action-result";
import {parseOverlayScalePct} from "@/lib/overlay-scale";
import {normalizeOptionalHttpUrl} from "@/lib/url-policy";
import {withNextRequestLogContext} from "@/lib/logging";
import {writeAlertsSettings} from "@/plugins/restream/host/alerts-settings";
import {readRestreamAudio, writeRestreamAudio} from "@/plugins/restream/host/audio";
import {ensureRestreamCaptureToken} from "@/plugins/restream/host/capture";
import {parseMusicLook, parseWaveBars, parseWaveSmoothPct} from "@/plugins/restream/host/program-music-wave";
import {
    hasRestreamKey,
    patchRestreamChannel,
    readRestreamChannel,
    readRestreamKey,
    saveRestreamKey,
    setRestreamEnabled,
    writeRestreamChannel,
} from "@/plugins/restream/host/store";
import {
    isInvalidTypedChannelLogin,
    resolveChannelLogin,
    streamKeyForChannelLookup,
} from "@/plugins/restream/host/twitch-helix";

function revalidateBroadcast(): void {
    revalidatePath("/");
    revalidatePath("/admin/plugins/growcast.restream");
    revalidatePath("/p/restream/program");
    revalidatePath("/p/restream/capture");
}

export async function saveTwitchKeyAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.restream", async () => {
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
        revalidateBroadcast();
        return {
            notice: isInvalidTypedChannelLogin(typedLogin, previous.login)
                ? "twitch_login_invalid"
                : "twitch_key_saved",
        };
    });
}

export async function saveBroadcastToastAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.restream", async () => {
        await requireAdmin();
        await patchRestreamChannel({toastEnabled: formData.get("toastEnabled") === "on"});
        revalidateBroadcast();
        return {notice: "saved"};
    });
}

export async function startTwitchRestreamAction(_formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.restream", async () => {
        await requireAdmin();
        await ensureRestreamCaptureToken();
        if (!(await hasRestreamKey())) {
            return {notice: "twitch_need_key"};
        }
        await setRestreamEnabled(true);
        revalidateBroadcast();
        return {notice: "twitch_started"};
    });
}

export async function stopTwitchRestreamAction(_formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.restream", async () => {
        await requireAdmin();
        await setRestreamEnabled(false);
        revalidateBroadcast();
        return {notice: "twitch_stopped"};
    });
}

export async function saveProgramAudioAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.restream", async () => {
        await requireAdmin();
        const existing = await readRestreamAudio();
        const parsedVolume = Number(formData.get("volume"));
        const volume = Math.min(1, Math.max(0, Number.isFinite(parsedVolume) ? parsedVolume : existing.volume));
        await writeRestreamAudio({
            url: existing.url,
            volume,
            paused: formData.get("paused") === "on",
            waveSmoothPct: existing.waveSmoothPct,
            musicLook: existing.musicLook,
            waveBars: existing.waveBars,
        });
        revalidateBroadcast();
        return {notice: "audio_saved"};
    });
}

export async function saveProgramAudioUrlAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.restream", async () => {
        await requireAdmin();
        const existing = await readRestreamAudio();
        const raw = String(formData.get("url") ?? formData.get("streamUrl") ?? formData.get("musicUrl") ?? "");
        const url = normalizeOptionalHttpUrl(raw);
        if (url === null) {
            return {notice: "save_failed"};
        }
        await writeRestreamAudio({
            url,
            volume: existing.volume,
            paused: existing.paused,
            waveSmoothPct: parseWaveSmoothPct(formData.get("waveSmoothPct")),
            musicLook: parseMusicLook(formData.get("musicLook")),
            waveBars: parseWaveBars(formData.get("waveBars")),
        });
        revalidateBroadcast();
        return {notice: "audio_saved"};
    });
}

export async function saveAlertsSettingsAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.restream", async () => {
        await requireAdmin();
        await writeAlertsSettings({
            follow: formData.get("follow") === "on",
            sub: formData.get("sub") === "on",
            raid: formData.get("raid") === "on",
            bits: formData.get("bits") === "on",
            stingEnabled: formData.get("stingEnabled") === "on",
            alertScalePct: parseOverlayScalePct(formData.get("alertScalePct")),
        });
        revalidateBroadcast();
        return {notice: "alerts_saved"};
    });
}
