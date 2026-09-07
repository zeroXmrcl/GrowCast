import {enqueueOverlayAlert, type OverlayAlert} from "@/lib/overlay-alert";
import {shouldEnqueueKind, type AlertsSettings} from "@/lib/restream/alerts-settings";

/**
 * Next can evaluate this module once per bundle (Server Action vs Route
 * Handler). Mixer publish must be visible to the overlay SSE route.
 */
export const OVERLAY_ALERT_HUB_GLOBAL_KEY = "__growcastOverlayAlertHub";

type OverlayAlertListener = (alert: OverlayAlert) => void;

type OverlayAlertHubState = {
    queue: OverlayAlert[];
    listeners: Set<OverlayAlertListener>;
};

function isHub(value: unknown): value is OverlayAlertHubState {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const candidate = value as OverlayAlertHubState;
    return Array.isArray(candidate.queue) && candidate.listeners instanceof Set;
}

function getHub(): OverlayAlertHubState {
    const g = globalThis as Record<string, unknown>;
    const existing = g[OVERLAY_ALERT_HUB_GLOBAL_KEY];
    if (isHub(existing)) {
        return existing;
    }
    const created: OverlayAlertHubState = {
        queue: [],
        listeners: new Set(),
    };
    g[OVERLAY_ALERT_HUB_GLOBAL_KEY] = created;
    return created;
}

export function peekOverlayAlertQueue(): OverlayAlert[] {
    return getHub().queue;
}

export function takeNextOverlayAlert(): OverlayAlert | undefined {
    return getHub().queue.shift();
}

export function subscribeOverlayAlerts(listener: OverlayAlertListener): () => void {
    const listeners = getHub().listeners;
    listeners.add(listener);
    let unsubscribed = false;
    return () => {
        if (unsubscribed) {
            return;
        }
        unsubscribed = true;
        listeners.delete(listener);
    };
}

export function publishOverlayAlert(alert: OverlayAlert, settings?: AlertsSettings): void {
    if (settings !== undefined && !shouldEnqueueKind(settings, alert.kind)) {
        return;
    }
    const hub = getHub();
    const next = enqueueOverlayAlert(hub.queue, alert);
    if (next === hub.queue) {
        return;
    }
    hub.queue = next;
    for (const listener of [...hub.listeners]) {
        listener(alert);
    }
}

/** Tests only. */
export function _resetOverlayAlertHubForTests(): void {
    const hub = getHub();
    hub.queue = [];
    hub.listeners.clear();
}
