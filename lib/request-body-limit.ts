import {withNotice} from "@/lib/admin/notice";
import {seeOther} from "@/lib/http-redirect";

/** Default cap for unauthenticated / non-media requests (proxy clones bodies). */
export const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;

/** Admin media POST may include several 15 MiB images. */
export const MEDIA_MAX_BODY_BYTES = 40 * 1024 * 1024;

/** Admin music POST may include one 20 MiB track plus multipart overhead. */
export const MUSIC_MAX_BODY_BYTES = 25 * 1024 * 1024;

const MEDIA_PATH = "/api/admin/media";
const MUSIC_PATH = "/api/admin/music";

function normalizePathname(pathname: string): string {
    if (pathname.length > 1 && pathname.endsWith("/")) {
        return pathname.slice(0, -1);
    }
    return pathname;
}

export function isBodyMethod(method: string): boolean {
    const normalized = method.toUpperCase();
    return normalized === "POST" || normalized === "PUT" || normalized === "PATCH";
}

export function maxBodyBytesFor(method: string, pathname: string): number {
    if (method.toUpperCase() === "POST") {
        const path = normalizePathname(pathname);
        if (path === MEDIA_PATH) {
            return MEDIA_MAX_BODY_BYTES;
        }
        if (path === MUSIC_PATH) {
            return MUSIC_MAX_BODY_BYTES;
        }
    }
    return DEFAULT_MAX_BODY_BYTES;
}

/** Fail-closed: missing, empty, or non-integer Content-Length is over cap. */
export function contentLengthExceedsCap(
    contentLengthHeader: string | null | undefined,
    capBytes: number,
): boolean {
    if (contentLengthHeader == null) {
        return true;
    }
    const trimmed = contentLengthHeader.trim();
    if (trimmed === "" || !/^\d+$/.test(trimmed)) {
        return true;
    }
    const length = Number(trimmed);
    return !Number.isSafeInteger(length) || length > capBytes;
}

export function payloadTooLargeResponse(method: string, pathname: string): Response {
    if (method.toUpperCase() === "POST") {
        const path = normalizePathname(pathname);
        if (path === MEDIA_PATH) {
            return seeOther(withNotice("/admin", "media_payload_too_large"));
        }
        if (path === MUSIC_PATH) {
            return seeOther(withNotice("/admin/stream", "music_payload_too_large"));
        }
    }
    return new Response("Payload Too Large", {
        status: 413,
        headers: {"Content-Type": "text/plain; charset=utf-8"},
    });
}
