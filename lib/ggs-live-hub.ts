import {GGS_HEARTBEAT_MS, fingerprint, type GgsLivePublic} from "@/lib/ggs-live";

export const GGS_MAX_SSE_SUBSCRIBERS = 64;
export const GGS_MAX_SSE_PER_CLIENT = 8;

type Listener = (event: "snapshot" | "heartbeat", state: GgsLivePublic) => void;

const listeners = new Set<Listener>();
const identityCounts = new Map<string, number>();
let lastPublic: GgsLivePublic | null = null;
let lastFingerprint = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function getLastPublic(): GgsLivePublic | null {
    return lastPublic;
}

export function subscriberCount(): number {
    return listeners.size;
}

export function identitySubscriberCount(identity: string): number {
    return identityCounts.get(identity) ?? 0;
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

export function subscribeLive(listener: Listener, identity = "unknown"): () => void {
    listeners.add(listener);
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
    ensureHeartbeat();
    return () => {
        listeners.delete(listener);
        const remaining = (identityCounts.get(identity) ?? 1) - 1;
        if (remaining <= 0) {
            identityCounts.delete(identity);
        } else {
            identityCounts.set(identity, remaining);
        }
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
    identityCounts.clear();
    lastPublic = null;
    lastFingerprint = "";
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}
