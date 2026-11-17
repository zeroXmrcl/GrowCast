import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {isSameOriginRequest} from "@/lib/same-origin";
import {
    saveAlertsSettingsAction,
    saveBroadcastToastAction,
    saveProgramAudioAction,
    saveProgramAudioUrlAction,
    saveTwitchKeyAction,
    startTwitchRestreamAction,
    stopTwitchRestreamAction,
} from "@/plugins/restream/admin/actions";
import {applyCameraLook} from "@/plugins/restream/admin/apply-camera-look";
import {applyMusicPost} from "@/plugins/restream/admin/apply-music-post";
import {applyProgramAlert} from "@/plugins/restream/admin/apply-program-alert";
import {readAlertsSettings} from "@/plugins/restream/host/alerts-settings";
import {readRestreamAudio} from "@/plugins/restream/host/audio";
import {
    captureStreamUrl,
    ensureRestreamCaptureToken,
    isRestreamCaptureAuthorized,
} from "@/plugins/restream/host/capture";
import {listMusicFiles} from "@/plugins/restream/host/music-files";
import {readTwitchOAuthFile} from "@/plugins/restream/host/twitch-oauth";
import {eventsubNotificationResponse, ensureEventsubSubscriptionsOnBoot} from "@/plugins/restream/host/eventsub";
import {programAlertsSseResponse} from "@/plugins/restream/host/overlay-alert-http";
import {
    programAudioGetResponse,
    programCameraGetResponse,
    programMusicGetResponse,
} from "@/plugins/restream/host/program-http";
import {
    broadcastGetResponse,
    hasRestreamKey,
    readRestreamChannel,
    readRestreamKey,
    readRestreamPublicView,
    saveRestreamKey,
    writeRestreamChannel,
} from "@/plugins/restream/host/store";
import {isInvalidTypedChannelLogin, resolveChannelLogin, streamKeyForChannelLookup} from "@/plugins/restream/host/twitch-helix";
import {cameraLookFilterCss, cameraLookTemperatureStyle} from "@/plugins/restream/host/camera-look";
import {readCameraLook} from "@/plugins/restream/host/camera-look-store";
import {twitchCallbackResponse, twitchConnectResponse} from "@/plugins/restream/host/oauth-http";
import type {PluginSetupResult} from "@/lib/plugins/types";
import {asString, isRecord} from "@/lib/coerce";
import {logAuthzDenied} from "@/lib/logging";
import {noticeJson} from "@/lib/admin/notice-response";
import {seeOther} from "@/lib/http-redirect";
import {revalidatePath} from "next/cache";
import {
    MUSIC_MAX_BODY_BYTES,
    contentLengthExceedsCap,
    payloadTooLargeResponse,
} from "@/lib/request-body-limit";

export async function onIngest(): Promise<void> {
    return;
}

export async function onBoot(): Promise<void> {
    await ensureEventsubSubscriptionsOnBoot();
}

function json(body: unknown, status: number): Response {
    return Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
}

function actionNotice(notice: string): Response {
    const failed = /failed|missing|invalid|need_|too_many/.test(notice);
    return noticeJson(notice, failed ? 400 : 200);
}

export async function handlePublic(request: Request, remainder: string): Promise<Response> {
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    const admin = await isAdminAuthenticated();
    if (pathName === "scene") {
        const token = new URL(request.url).searchParams.get("token") ?? undefined;
        const expected = await ensureRestreamCaptureToken();
        const capture = isRestreamCaptureAuthorized(expected, token);
        if (!admin && !capture) {
            return json({error: "Not found"}, 404);
        }
        const grow = await getCurrentGrow();
        return json({
            plant: grow.plant,
            name: grow.name,
            seededAt: grow.details.seededAt,
            overlayLayout: grow.overlayLayout,
            overlayScalePct: grow.overlayScalePct,
            climateTick: grow.climateTick,
            devicesDesign: grow.devicesDesign,
            streamUrl: capture ? captureStreamUrl(grow.streamUrl) : grow.streamUrl,
            stage: grow.details.stage,
            lightSchedule: grow.details.lightSchedule,
            strain: grow.details.strain,
            captureToken: capture ? token : undefined,
        }, 200);
    }
    if (pathName === "broadcast") {
        return broadcastGetResponse();
    }
    if (pathName === "program-audio") {
        return programAudioGetResponse(request, {admin});
    }
    if (pathName === "program-camera") {
        return programCameraGetResponse(request, {admin});
    }
    if (pathName === "program-alerts") {
        return programAlertsSseResponse(request, {admin});
    }
    if (pathName === "eventsub") {
        const rawBody = await request.text();
        return eventsubNotificationResponse(rawBody, request.headers, {admin: false});
    }
    if (pathName === "twitch-connect") {
        return twitchConnectResponse();
    }
    if (pathName === "twitch-callback") {
        return twitchCallbackResponse(request);
    }
    const musicMatch = /^music\/(.+)$/.exec(pathName);
    if (musicMatch) {
        return programMusicGetResponse(request, musicMatch[1] ?? "", {admin});
    }
    return json({error: "Not found"}, 404);
}

export async function handleAction(request: Request, remainder: string): Promise<Response> {
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    if (pathName === "admin-state" && request.method === "GET") {
        if (!(await isAdminAuthenticated())) {
            return json({error: "Unauthorized"}, 401);
        }
        const [restream, audio, alerts, oauth, look, musicFiles] = await Promise.all([
            readRestreamPublicView(),
            readRestreamAudio(),
            readAlertsSettings(),
            readTwitchOAuthFile(),
            readCameraLook(),
            listMusicFiles(),
            ensureRestreamCaptureToken(),
        ]);
        return json({
            restream,
            audio,
            alerts,
            oauthLogin: oauth?.login ?? "",
            look,
            musicFiles,
        }, 200);
    }
    if (pathName === "twitch-key" && request.method === "POST") {
        return actionNotice((await saveTwitchKeyAction(await request.formData())).notice);
    }
    if (pathName === "twitch-toast" && request.method === "POST") {
        return actionNotice((await saveBroadcastToastAction(await request.formData())).notice);
    }
    if (pathName === "twitch-start" && request.method === "POST") {
        return actionNotice((await startTwitchRestreamAction(await request.formData())).notice);
    }
    if (pathName === "twitch-stop" && request.method === "POST") {
        return actionNotice((await stopTwitchRestreamAction(await request.formData())).notice);
    }
    if (pathName === "program-audio" && request.method === "POST") {
        return actionNotice((await saveProgramAudioAction(await request.formData())).notice);
    }
    if (pathName === "program-audio-url" && request.method === "POST") {
        return actionNotice((await saveProgramAudioUrlAction(await request.formData())).notice);
    }
    if (pathName === "alerts" && request.method === "POST") {
        return actionNotice((await saveAlertsSettingsAction(await request.formData())).notice);
    }
    if (pathName === "camera-look" && request.method === "POST") {
        if (!isSameOriginRequest(request)) {
            return json({ok: false, reason: "cross_origin"}, 403);
        }
        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.camera_look"});
            return json({ok: false, reason: "unauthorized"}, 401);
        }
        let raw: unknown;
        try {
            raw = await request.json();
        } catch {
            return json({ok: false, reason: "invalid_json"}, 400);
        }
        const result = await applyCameraLook(raw);
        if (!result.ok) {
            return json(result, 400);
        }
        return json(result, 200);
    }
    if (pathName === "music" && request.method === "POST") {
        if (contentLengthExceedsCap(request.headers.get("content-length"), MUSIC_MAX_BODY_BYTES)) {
            return payloadTooLargeResponse("POST", "/api/plugins/v1/growcast.restream/x/music");
        }
        if (!isSameOriginRequest(request)) {
            return noticeJson("music_invalid_file");
        }
        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.music"});
            return seeOther("/admin?error=unauthorized");
        }
        let result;
        try {
            result = await applyMusicPost(await request.formData());
        } catch {
            return noticeJson("music_invalid_file");
        }
        if (!result.ok) {
            return noticeJson(result.notice);
        }
        revalidatePath("/admin/plugins/growcast.restream");
        revalidatePath("/p/restream/program");
        revalidatePath("/p/restream/capture");
        return seeOther("/admin/plugins/growcast.restream?notice=music_saved");
    }
    if (pathName === "program-alert" && request.method === "POST") {
        if (!isSameOriginRequest(request)) {
            return json({ok: false, reason: "cross_origin"}, 403);
        }
        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.program_alert"});
            return json({ok: false, reason: "unauthorized"}, 401);
        }
        let raw: unknown;
        try {
            raw = await request.json();
        } catch {
            return json({ok: false, reason: "invalid_json"}, 400);
        }
        const alertBody = isRecord(raw) ? asString(raw.alertBody) : "";
        const result = await applyProgramAlert(alertBody);
        if (!result.ok) {
            return json(result, 400);
        }
        return json(result, 200);
    }
    return json({error: "Not found"}, 404);
}

export async function overlayLook() {
    const look = await readCameraLook();
    return {
        lookCss: cameraLookFilterCss(look),
        temperatureStyle: cameraLookTemperatureStyle(look.temperature),
    };
}

export async function setupStatus() {
    const saved = await hasRestreamKey();
    return {complete: saved, detail: saved ? "Key saved. Start is on Broadcast." : null};
}

export async function handleSetup(formData: FormData): Promise<PluginSetupResult> {
    const twitchKey = String(formData.get("twitchKey") ?? "");
    const typedLogin = String(formData.get("twitchLogin") ?? "");
    if (!twitchKey.trim()) {
        return {ok: false, message: "Enter a Twitch stream key."};
    }
    const previous = await readRestreamChannel();
    if (isInvalidTypedChannelLogin(typedLogin, previous.login)) {
        return {ok: false, message: "That channel name is not a Twitch login."};
    }
    const login = await resolveChannelLogin({
        typedLogin,
        streamKey: streamKeyForChannelLookup(twitchKey, await readRestreamKey()),
        previousLogin: previous.login,
    });
    await writeRestreamChannel({login, toastEnabled: previous.toastEnabled});
    await saveRestreamKey(twitchKey);
    return {ok: true, detail: "Key saved. Start is on Broadcast."};
}
