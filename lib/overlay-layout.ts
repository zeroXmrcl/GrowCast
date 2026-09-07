export type OverlayLayout = "left-rail" | "bottom-bar";

export const DEFAULT_OVERLAY_LAYOUT: OverlayLayout = "left-rail";

export function parseOverlayLayout(value: unknown): OverlayLayout {
    return value === "bottom-bar" ? "bottom-bar" : DEFAULT_OVERLAY_LAYOUT;
}

export function overlayPublicUrl(origin: string): string {
    return new URL("/overlay", `${origin}/`).toString();
}
