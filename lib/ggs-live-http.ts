import {
    EMPTY_LIVE_PUBLIC,
    GGS_PLUGIN_ID,
    parseIngestBody,
    withStale,
    type GgsLivePublic,
} from "@/lib/ggs-live";
import {climatePreviewSnapshot} from "@/lib/climate/local-preview";
import {recordClimateOnIngestBestEffort} from "@/lib/climate/writer";
import {accrueEnergyOnIngest} from "@/lib/energy/accrue";
import {logEnergy} from "@/lib/energy/log";
import {sanitizeError} from "@/lib/logging/redact";
import {readGgsLive, saveGgsLive} from "@/lib/ggs-live-store";
import {
    publishLive,
    releaseSseSlot,
    subscribeLive,
    tryReserveSseSlot,
    type SseSlot,
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

/** Dev-server gate. Kept here so the env read is not constant-folded in a shared module. */
export function devClimatePreviewEnabled(): boolean {
    const flag = `${process.env.GROWCAST_CLIMATE_PREVIEW ?? ""}`.trim().toLowerCase();
    const name = `${process.env.GROWCAST_ENV ?? ""}`.trim().toLowerCase()
        || `${process.env.NODE_ENV ?? ""}`.trim().toLowerCase();
    return flag === "1" || flag === "true"
        || (flag !== "0" && flag !== "false" && (name === "development" || name === "dev"));
}

async function readPublicLive(): Promise<GgsLivePublic> {
    const stored = await readGgsLive();
    if (stored) {
        return withStale(stored);
    }
    if (devClimatePreviewEnabled()) {
        return climatePreviewSnapshot();
    }
    return EMPTY_LIVE_PUBLIC;
}

export async function liveClimateGetResponse(): Promise<Response> {
    const body = await readPublicLive();
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
    const reserved = tryReserveSseSlot(identity);
    if (reserved === null) {
        return sseUnavailable();
    }
    const slot: SseSlot = reserved;

    let hello;
    try {
        hello = await readPublicLive();
    } catch (error) {
        releaseSseSlot(slot);
        throw error;
    }
    let unsubscribe: (() => void) | undefined;
    let closed = false;

    function teardown(): void {
        if (closed) {
            return;
        }
        closed = true;
        unsubscribe?.();
        releaseSseSlot(slot);
    }

    if (request?.signal.aborted) {
        teardown();
        return sseUnavailable();
    }
    request?.signal.addEventListener("abort", teardown, {once: true});

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            if (closed) {
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
                return;
            }
            const send = (event: "snapshot" | "heartbeat", state: GgsLivePublic) => {
                if (closed) {
                    return;
                }
                if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                    teardown();
                    try {
                        controller.close();
                    } catch {
                        /* already closed */
                    }
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
    await recordClimateOnIngestBestEffort(parsed.value);
    try {
        await accrueEnergyOnIngest(parsed.value);
    } catch (error) {
        logEnergy("energy_accrue_failed", {err: sanitizeError(error)});
    }
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
