import {safeHttpUrlOrEmpty} from "@/lib/url-policy";

export type OverlayStream = "transparent" | "include";

export const DEFAULT_OVERLAY_STREAM: OverlayStream = "transparent";

export function parseOverlayStream(value: unknown): OverlayStream {
    return value === "include" ? "include" : DEFAULT_OVERLAY_STREAM;
}

export function overlayStreamEmbeds(stream: OverlayStream, streamUrl: string): boolean {
    return stream === "include" && safeHttpUrlOrEmpty(streamUrl) !== "";
}
