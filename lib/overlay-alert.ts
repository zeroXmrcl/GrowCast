import type {OverlayLayout} from "@/lib/overlay-layout";

export const OVERLAY_ALERT_MAX_QUEUE = 15;
export const OVERLAY_ALERT_DISPLAY_MS = 6_000;

export type OverlayAlertKind = "follow" | "sub" | "raid" | "bits" | "manual";
export type OverlayAlertPlacement = "top-right" | "top-left";

export type OverlayAlert = {
    id: string;
    kind: OverlayAlertKind;
    title: string;
    body: string;
    createdAt: number;
};

export function alertPlacement(layout: OverlayLayout): OverlayAlertPlacement {
    return layout === "bottom-bar" ? "top-left" : "top-right";
}

export function enqueueOverlayAlert(
    queue: OverlayAlert[],
    alert: OverlayAlert,
): OverlayAlert[] {
    if (alert.kind === "manual" && alert.body.trim().length === 0) {
        return queue;
    }
    const next = [...queue, alert];
    if (next.length <= OVERLAY_ALERT_MAX_QUEUE) {
        return next;
    }
    return next.slice(next.length - OVERLAY_ALERT_MAX_QUEUE);
}

const ALERT_TOAST_CHIP: Record<OverlayAlertKind, string> = {
    follow: "Follow",
    sub: "Sub",
    raid: "Raid",
    bits: "Bits",
    manual: "Alert",
};

export function alertToastCopy(alert: OverlayAlert): {chip: string; headline: string} {
    return {chip: ALERT_TOAST_CHIP[alert.kind], headline: alert.body};
}

export function replayableOverlayAlerts(
    queue: OverlayAlert[],
    nowMs: number,
): OverlayAlert[] {
    return queue.filter((entry) => nowMs - entry.createdAt < OVERLAY_ALERT_DISPLAY_MS);
}
