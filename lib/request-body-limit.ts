import {withNotice} from "@/lib/admin/notice";
import {seeOther} from "@/lib/http-redirect";

/** Default cap for unauthenticated / non-media requests (proxy clones bodies). */
export const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;

/** Admin media POST may include several 15 MiB images. */
export const MEDIA_MAX_BODY_BYTES = 40 * 1024 * 1024;

const MEDIA_PATH = "/api/admin/media";

function normalizePathname(pathname: string): string {
    if (pathname.length > 1 && pathname.endsWith("/")) {
        return pathname.slice(0, -1);
    }
    return pathname;
}

export function maxBodyBytesFor(method: string, pathname: string): number {
    if (method.toUpperCase() === "POST" && normalizePathname(pathname) === MEDIA_PATH) {
        return MEDIA_MAX_BODY_BYTES;
    }
    return DEFAULT_MAX_BODY_BYTES;
}

export function contentLengthExceedsCap(
    contentLengthHeader: string | null | undefined,
    capBytes: number,
): boolean {
    if (contentLengthHeader == null || contentLengthHeader.trim() === "") {
        return false;
    }
    const length = Number(contentLengthHeader);
    return Number.isFinite(length) && length > capBytes;
}

export function payloadTooLargeResponse(method: string, pathname: string): Response {
    if (method.toUpperCase() === "POST" && normalizePathname(pathname) === MEDIA_PATH) {
        return seeOther(withNotice("/admin", "media_payload_too_large"));
    }
    return new Response("Payload Too Large", {
        status: 413,
        headers: {"Content-Type": "text/plain; charset=utf-8"},
    });
}
