import {GGS_HEARTBEAT_MS, fingerprint, type GgsLivePublic} from "@/lib/ggs-live";

export const GGS_MAX_SSE_SUBSCRIBERS = 64;
export const GGS_MAX_SSE_PER_CLIENT = 8;

type Listener = (event: "snapshot" | "heartbeat", state: GgsLivePublic) => void;

export type SseSlot = {
    identity: string;
    released: boolean;
};

const listeners = new Set<Listener>();
const slots = new Set<SseSlot>();
const identityCounts = new Map<string, number>();
let lastPublic: GgsLivePublic | null = null;
let lastFingerprint = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function getLastPublic(): GgsLivePublic | null {
    return lastPublic;
}

export function subscriberCount(): number {
    return slots.size;
}

export function identitySubscriberCount(identity: string): number {
    return identityCounts.get(identity) ?? 0;
}

export function tryReserveSseSlot(identity: string): SseSlot | null {
    if (slots.size >= GGS_MAX_SSE_SUBSCRIBERS) {
        return null;
    }
    if ((identityCounts.get(identity) ?? 0) >= GGS_MAX_SSE_PER_CLIENT) {
        return null;
    }
    const slot: SseSlot = {identity, released: false};
    slots.add(slot);
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
    return slot;
}

export function releaseSseSlot(slot: SseSlot): void {
    if (slot.released) {
        return;
    }
    slot.released = true;
    if (!slots.delete(slot)) {
        return;
    }
    const remaining = (identityCounts.get(slot.identity) ?? 1) - 1;
    if (remaining <= 0) {
        identityCounts.delete(slot.identity);
    } else {
        identityCounts.set(slot.identity, remaining);
    }
}

export function publishLive(state: GgsLivePublic): {changed: boolean} {
    const nextFp = fingerprint(state);
    const changed = nextFp !== lastFingerprint;
    lastPublic = state;
    lastFingerprint = nextFp;
    if (changed) {
        for (const listener of listeners) {
            listener("snapshot", state);
        }
    }
    return {changed};
}

export function subscribeLive(listener: Listener, _identity = "unknown"): () => void {
    listeners.add(listener);
    ensureHeartbeat();
    let unsubscribed = false;
    return () => {
        if (unsubscribed) {
            return;
        }
        unsubscribed = true;
        listeners.delete(listener);
        if (listeners.size === 0 && heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    };
}

function ensureHeartbeat(): void {
    if (heartbeatTimer) {
        return;
    }
    heartbeatTimer = setInterval(() => {
        if (!lastPublic) {
            return;
        }
        for (const listener of listeners) {
            listener("heartbeat", lastPublic);
        }
    }, GGS_HEARTBEAT_MS);
    if (typeof heartbeatTimer === "object" && "unref" in heartbeatTimer) {
        heartbeatTimer.unref();
    }
}

/** Tests only. */
export function _resetGgsHubForTests(): void {
    listeners.clear();
    slots.clear();
    identityCounts.clear();
    lastPublic = null;
    lastFingerprint = "";
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}
