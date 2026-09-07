import type {OverlayLayout} from "@/lib/overlay-layout";

export const DEFAULT_OVERLAY_SCALE_PCT = 100;
export const OVERLAY_SCALE_MIN = 50;
export const OVERLAY_SCALE_MAX = 200;
export const OVERLAY_SCALE_STEP = 5;

export function parseOverlayScalePct(value: unknown): number {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_OVERLAY_SCALE_PCT;
    }
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) {
        return DEFAULT_OVERLAY_SCALE_PCT;
    }
    const clamped = Math.min(OVERLAY_SCALE_MAX, Math.max(OVERLAY_SCALE_MIN, n));
    return Math.round(clamped / OVERLAY_SCALE_STEP) * OVERLAY_SCALE_STEP;
}

export function overlayHudScaleStyle(
    scalePct: number,
    layout: OverlayLayout,
): {transform: string; transformOrigin: string} {
    const pct = parseOverlayScalePct(scalePct);
    return {
        transform: pct === DEFAULT_OVERLAY_SCALE_PCT ? "none" : `scale(${pct / 100})`,
        transformOrigin: layout === "bottom-bar" ? "bottom left" : "top left",
    };
}
