import {safeHttpUrlOrEmpty} from "@/lib/url-policy";

export const COVER_MIN_MS = 3000;
export const COVER_FADE_MS = 400;

export function hlsPlaylistUrl(streamUrl: string): string {
    const safe = safeHttpUrlOrEmpty(streamUrl);
    if (!safe) {
        return "";
    }
    const url = new URL(safe);
    if (url.pathname.toLowerCase().endsWith(".m3u8")) {
        return safe;
    }
    const trimmed = url.pathname.replace(/\/$/, "");
    url.pathname = `${trimmed}/index.m3u8`;
    return url.toString();
}

export function coverShouldHide(input: {
    fatal: boolean;
    playing: boolean;
    shownAtMs: number | null;
    nowMs: number;
}): boolean {
    if (input.fatal) {
        return false;
    }
    if (input.shownAtMs === null) {
        return true;
    }
    if (!input.playing) {
        return false;
    }
    return input.nowMs - input.shownAtMs >= COVER_MIN_MS;
}
