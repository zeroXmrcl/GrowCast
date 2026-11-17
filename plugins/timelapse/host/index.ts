import path from "node:path";
import {readFile} from "node:fs/promises";
import {logHttpPathTraversalBlocked} from "@/lib/logging";
import {bytesForResponse, openMediaFile, streamFixedMediaFile} from "@/lib/open-media-file";
import {IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";
import {encodePortableSnapshotThumb, openSnapshotThumb, snapshotThumbResponse} from "@/lib/snapshot-thumb";
import {getTimelapseSettingsRecord} from "@/plugins/timelapse/host/timelapse-settings";
import {
    SNAPSHOT_DIR,
    TIMELAPSE_DIR,
    getSnapshotFiles,
    pathExists,
} from "@/plugins/timelapse/host/extension-status";
import {importLegacyTimelapseEnv} from "@/plugins/timelapse/host/import-legacy-sidecars";
import {isRtspUrl, readTimelapseRtsp, writeTimelapseSidecarEnv} from "@/plugins/timelapse/host/timelapse-sidecar-env";
import {canonicalTimeZone, updateTimelapseSettings} from "@/plugins/timelapse/host/timelapse-settings";
import type {PluginSetupResult} from "@/lib/plugins/types";

const MAX_VISION_BYTES = 400_000;
const MAX_SOURCE_BYTES = 12_000_000;

export async function meshSettings(): Promise<Record<string, unknown>> {
    return getTimelapseSettingsRecord() as unknown as Record<string, unknown>;
}

export function archiveMediaSources() {
    return {snapshotsDir: SNAPSHOT_DIR, timelapseDir: TIMELAPSE_DIR};
}

export async function onBoot(): Promise<void> {
    await importLegacyTimelapseEnv();
}

export async function setupStatus() {
    const rtsp = await readTimelapseRtsp();
    return {
        complete: isRtspUrl(rtsp),
        detail: isRtspUrl(rtsp) ? "Saved" : null,
    };
}

export async function handleSetup(formData: FormData): Promise<PluginSetupResult> {
    const rtsp = String(formData.get("rtspStream") ?? "").trim();
    const timezone = String(formData.get("timezone") ?? "").trim();
    const intervalRaw = String(formData.get("interval") ?? "").trim();
    const interval = Number(intervalRaw);
    if (!isRtspUrl(rtsp)) {
        return {ok: false, message: "Use the camera’s local rtsp:// address, like rtsp://user:password@192.168.1.20:554/stream."};
    }
    if (!Number.isInteger(interval) || interval < 1) {
        return {ok: false, message: "Interval is a whole number of minutes, at least 1."};
    }
    const zone = canonicalTimeZone(timezone);
    if (!zone) {
        return {ok: false, message: "Timezone must be an IANA name, like Europe/Berlin."};
    }
    await updateTimelapseSettings({
        timezone: zone,
        intervalMinutes: interval,
    });
    await writeTimelapseSidecarEnv({
        RTSP_STREAM: rtsp,
        TZ: zone,
        INTERVAL: String(interval),
    });
    return {ok: true, detail: `Camera address, ${interval} min, ${zone}`};
}

export async function handlePublic(request: Request, remainder: string): Promise<Response> {
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    if (pathName === "latest") {
        const file = path.join(TIMELAPSE_DIR, "latest_timelapse.mp4");
        return streamFixedMediaFile(file, request, VIDEO_EXTENSIONS, "no-store, must-revalidate");
    }
    const snapshotMatch = /^snapshots\/(.+)$/.exec(pathName);
    if (snapshotMatch) {
        const filename = snapshotMatch[1] ?? "";
        const url = new URL(request.url);
        if (url.searchParams.get("thumb") === "1") {
            const thumb = await openSnapshotThumb(SNAPSHOT_DIR, filename);
            if (!thumb.ok && thumb.status === 400) {
                logHttpPathTraversalBlocked({reason: "invalid_filename"});
            }
            return snapshotThumbResponse(thumb, {versioned: url.searchParams.has("v")});
        }
        const opened = await openMediaFile(SNAPSHOT_DIR, filename, IMAGE_EXTENSIONS);
        if (!opened.ok) {
            if (opened.status === 400) {
                logHttpPathTraversalBlocked({reason: "invalid_filename"});
                return new Response("Invalid filename", {status: 400});
            }
            return new Response("File not found", {status: 404});
        }
        return new Response(bytesForResponse(opened.buffer), {
            status: 200,
            headers: {
                "Content-Type": opened.contentType,
                "Cache-Control": "no-store, must-revalidate",
            },
        });
    }
    return new Response("Not found", {status: 404, headers: {"Cache-Control": "no-store"}});
}

export async function newestSnapshotStill(): Promise<{mime: "image/jpeg"; dataUrl: string} | null> {
    const files = await getSnapshotFiles();
    const newest = files[0];
    if (!newest || !isSafeMediaFilename(newest, IMAGE_EXTENSIONS)) {
        return null;
    }
    if (!(await pathExists(path.join(SNAPSHOT_DIR, newest)))) {
        return null;
    }
    try {
        const input = await readFile(path.join(SNAPSHOT_DIR, newest));
        if (input.length === 0 || input.length > MAX_SOURCE_BYTES) {
            return null;
        }
        const jpeg = await encodePortableSnapshotThumb(input);
        if (jpeg.length === 0 || jpeg.length > MAX_VISION_BYTES) {
            return null;
        }
        return {mime: "image/jpeg", dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`};
    } catch {
        return null;
    }
}
