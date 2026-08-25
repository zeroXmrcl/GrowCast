import type {OverlayLayout} from "@/lib/overlay-layout";

export const OVERLAY_ENTER_MS = 220;
export const OVERLAY_LEAVE_MS = 160;
export const OVERLAY_STAGGER_MS = 40;
export const OVERLAY_SLIDE_PX = 10;
export const OVERLAY_EASING_ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";
export const OVERLAY_EASING_LEAVE = "cubic-bezier(0.4, 0, 1, 1)";
export const OVERLAY_CHIP_COLOR_MS = 150;
export const OVERLAY_LIVE_PULSE_MS = 2000;

export const OVERLAY_ORDER_IDENTITY = 0;
export const OVERLAY_ORDER_CLIMATE = 1;
export const OVERLAY_ORDER_GEAR = 2;
export const OVERLAY_ORDER_ENERGY = 3;

export function overlayStaggerMs(order: number, reducedMotion: boolean): number {
    return reducedMotion ? 0 : order * OVERLAY_STAGGER_MS;
}

export function overlaySlideTransform(
    layout: OverlayLayout,
    reducedMotion: boolean,
): string {
    if (reducedMotion) {
        return "none";
    }
    if (layout === "bottom-bar") {
        return `translateY(${OVERLAY_SLIDE_PX}px)`;
    }
    return `translateX(-${OVERLAY_SLIDE_PX}px)`;
}
