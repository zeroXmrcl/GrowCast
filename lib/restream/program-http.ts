import path from "node:path";
import {openMediaFile} from "@/lib/open-media-file";
import {readAlertsSettings} from "@/lib/restream/alerts-settings";
import {readRestreamAudio, resolveAudioSource} from "@/lib/restream/audio";
import {readCameraLook} from "@/lib/restream/camera-look-store";
import {resolveRestreamCaptureToken} from "@/lib/restream/capture";
import {MUSIC_EXTENSIONS, listMusicFiles} from "@/lib/restream/music-files";
import {restreamMusicDir} from "@/lib/restream/paths";
import {captureTokenFromRequest, isProgramAuthorized} from "@/lib/restream/program-auth";

const NO_STORE = "no-store";

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: {"Cache-Control": NO_STORE},
    });
}

async function authorizeProgramRequest(
    request: Request,
    admin: boolean,
): Promise<boolean> {
    return isProgramAuthorized({
        admin,
        expectedToken: await resolveRestreamCaptureToken(),
        providedToken: captureTokenFromRequest(request),
    });
}

function musicContentType(filename: string, fallback: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".mp3") {
        return "audio/mpeg";
    }
    if (ext === ".ogg") {
        return "audio/ogg";
    }
    if (ext === ".wav") {
        return "audio/wav";
    }
    if (ext === ".m4a") {
        return "audio/mp4";
    }
    return fallback;
}

export async function programCameraGetResponse(
    request: Request,
    options: {admin: boolean},
): Promise<Response> {
    if (!(await authorizeProgramRequest(request, options.admin))) {
        return notFound();
    }
    const look = await readCameraLook();
    return Response.json(look, {
        headers: {"Cache-Control": NO_STORE},
    });
}

export async function programAudioGetResponse(
    request: Request,
    options: {admin: boolean},
): Promise<Response> {
    if (!(await authorizeProgramRequest(request, options.admin))) {
        return notFound();
    }

    const audio = await readRestreamAudio();
    const files = await listMusicFiles();
    const alerts = await readAlertsSettings();
    const kind = resolveAudioSource(audio, files);
    return Response.json(
        {
            kind,
            url: kind === "url" ? audio.url : "",
            files,
            volume: audio.volume,
            paused: audio.paused,
            stingEnabled: alerts.stingEnabled,
            alertScalePct: alerts.alertScalePct,
            waveSmoothPct: audio.waveSmoothPct,
            musicLook: audio.musicLook,
            waveBars: audio.waveBars,
        },
        {
            headers: {"Cache-Control": NO_STORE},
        },
    );
}

export async function programMusicGetResponse(
    request: Request,
    filename: string,
    options: {admin: boolean},
): Promise<Response> {
    if (!(await authorizeProgramRequest(request, options.admin))) {
        return notFound();
    }

    const opened = await openMediaFile(restreamMusicDir(), filename, MUSIC_EXTENSIONS);
    if (!opened.ok) {
        return notFound();
    }

    return new Response(new Uint8Array(opened.buffer), {
        status: 200,
        headers: {
            "Content-Type": musicContentType(filename, opened.contentType),
            "Cache-Control": NO_STORE,
        },
    });
}
