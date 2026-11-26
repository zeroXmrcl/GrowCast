import path from "node:path";
import {readFile} from "node:fs/promises";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {noticeJson} from "@/lib/admin/notice-response";
import {logHttpPathTraversalBlocked} from "@/lib/logging";
import {bytesForResponse, openMediaFile, streamFixedMediaFile} from "@/lib/open-media-file";
import {IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";
import {encodePortableSnapshotThumb, openSnapshotThumb, snapshotThumbResponse} from "@/lib/snapshot-thumb";
import {saveTimelapseAction} from "@/plugins/timelapse/admin/actions";
import {getTimelapseSettings, getTimelapseSettingsRecord} from "@/plugins/timelapse/host/timelapse-settings";
import {
    LEGACY_SNAPSHOT_DIR,
    SNAPSHOT_DIR,
    TIMELAPSE_DIR,
    getSnapshotFiles,
    getTimelapseFiles,
    isTimelapsePluginInstalled,
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
        return {ok: false, message: "Use the camera’s local rtsp:// address, like rtsp://user:password@<camera-ip>:554/stream."};
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

export async function handleAction(request: Request, remainder: string): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return Response.json({error: "Unauthorized"}, {status: 401, headers: {"Cache-Control": "no-store"}});
    }
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    if (pathName === "admin-state" && request.method === "GET") {
        const [timelapseSettings, rtspStream] = await Promise.all([
            getTimelapseSettings(),
            readTimelapseRtsp().catch(() => ""),
        ]);
        return Response.json({timelapseSettings, rtspStream}, {headers: {"Cache-Control": "no-store"}});
    }
    if (pathName === "settings" && request.method === "POST") {
        const result = await saveTimelapseAction(await request.formData());
        return noticeJson(result.notice, result.notice === "saved" ? 200 : 400);
    }
    return Response.json({error: "Not found"}, {status: 404, headers: {"Cache-Control": "no-store"}});
}

export async function handlePublic(request: Request, remainder: string): Promise<Response> {
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    if (pathName === "gallery-index") {
        const installed = await isTimelapsePluginInstalled();
        const [snapshots, videos] = await Promise.all([getSnapshotFiles(), getTimelapseFiles()]);
        return Response.json({
            installed,
            videoUrl: videos[0] ? "/api/timelapse" : null,
            snapshots: snapshots.map((name) => ({
                name,
                url: `/api/snapshots/${encodeURIComponent(name)}`,
            })),
        }, {headers: {"Cache-Control": "no-store"}});
    }
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
        let opened = await openMediaFile(SNAPSHOT_DIR, filename, IMAGE_EXTENSIONS);
        if (!opened.ok && opened.status === 404) {
            opened = await openMediaFile(LEGACY_SNAPSHOT_DIR, filename, IMAGE_EXTENSIONS);
        }
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
    const existing = (await pathExists(path.join(SNAPSHOT_DIR, newest)))
        ? path.join(SNAPSHOT_DIR, newest)
        : (await pathExists(path.join(LEGACY_SNAPSHOT_DIR, newest)))
            ? path.join(LEGACY_SNAPSHOT_DIR, newest)
            : null;
    if (!existing) {
        return null;
    }
    try {
        const input = await readFile(existing);
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
