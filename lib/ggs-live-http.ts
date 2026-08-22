import {
    EMPTY_LIVE_PUBLIC,
    GGS_PLUGIN_ID,
    parseIngestBody,
    withStale,
    type GgsLivePublic,
} from "@/lib/ggs-live";
import {readGgsLive, saveGgsLive} from "@/lib/ggs-live-store";
import {
    publishLive,
    releaseSseSlot,
    subscribeLive,
    tryReserveSseSlot,
} from "@/lib/ggs-live-hub";
import {meshClientKey, requireMeshAuthThrottled} from "@/lib/mesh-throttle";
import {
    logGgsStateIngested,
    logGgsStateRejected,
    logMeshPluginUnknown,
} from "@/lib/logging/security-events";

const INGEST_MIN_INTERVAL_MS = 2_000;
let lastIngestMs = 0;

export function _resetIngestRateForTests(): void {
    lastIngestMs = 0;
}

function allowIngestNow(): boolean {
    const now = Date.now();
    if (now - lastIngestMs < INGEST_MIN_INTERVAL_MS) {
        return false;
    }
    lastIngestMs = now;
    return true;
}

function noStoreJson(body: unknown, status = 200): Response {
    return Response.json(body, {
        status,
        headers: {"Cache-Control": "no-store"},
    });
}

export async function liveClimateGetResponse(): Promise<Response> {
    const stored = await readGgsLive();
    const body = stored ? withStale(stored) : EMPTY_LIVE_PUBLIC;
    return Response.json(body, {
        headers: {"Cache-Control": "no-store, must-revalidate"},
    });
}

function encodeSse(event: "snapshot" | "heartbeat", state: GgsLivePublic): Uint8Array {
    const id = state.updatedAt ?? String(Date.now());
    return new TextEncoder().encode(
        `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(state)}\n\n`,
    );
}

function sseUnavailable(): Response {
    return new Response(null, {
        status: 503,
        headers: {
            "Cache-Control": "no-store",
            "Retry-After": "5",
        },
    });
}

export async function liveClimateStreamResponse(request?: Request): Promise<Response> {
    const identity = request ? meshClientKey(request) : "unknown";
    const slot = tryReserveSseSlot(identity);
    if (!slot) {
        return sseUnavailable();
    }

    let stored;
    try {
        stored = await readGgsLive();
    } catch (error) {
        releaseSseSlot(slot);
        throw error;
    }
    const hello = stored ? withStale(stored) : EMPTY_LIVE_PUBLIC;
    let unsubscribe: (() => void) | undefined;
    let closed = false;

    function teardown(): void {
        closed = true;
        unsubscribe?.();
        releaseSseSlot(slot);
    }

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (event: "snapshot" | "heartbeat", state: GgsLivePublic) => {
                if (closed) {
                    return;
                }
                try {
                    controller.enqueue(encodeSse(event, state));
                } catch {
                    teardown();
                }
            };
            send("snapshot", hello);
            unsubscribe = subscribeLive(send, identity);
        },
        cancel() {
            teardown();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}

export async function liveClimateIngestResponse(
    request: Request,
    pluginId: string,
): Promise<Response> {
    const auth = requireMeshAuthThrottled(request);
    if (auth) {
        return auth;
    }

    if (pluginId !== GGS_PLUGIN_ID) {
        logMeshPluginUnknown({plugin_id: pluginId});
        return noStoreJson({error: "Unknown plugin"}, 404);
    }

    if (!allowIngestNow()) {
        return new Response(null, {
            status: 429,
            headers: {"Cache-Control": "no-store", "Retry-After": "2"},
        });
    }

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        logGgsStateRejected({reason: "invalid_json"});
        return noStoreJson({error: "Invalid JSON"}, 400);
    }

    const parsed = parseIngestBody(raw);
    if (!parsed.ok) {
        logGgsStateRejected({reason: parsed.error});
        return noStoreJson({error: "Invalid body"}, 400);
    }

    await saveGgsLive(parsed.value);
    const publicState = withStale(parsed.value);
    const {changed} = publishLive(publicState);
    logGgsStateIngested({
        device_count: parsed.value.devices.length,
        online: parsed.value.online,
        changed,
    });
    return new Response(null, {
        status: 204,
        headers: {"Cache-Control": "no-store"},
    });
}
