import type {OverlayAlert} from "@/lib/overlay-alert";
import {peekReplayableOverlayAlerts, subscribeOverlayAlerts} from "@/lib/overlay-alert-hub";
import {resolveRestreamCaptureToken} from "@/lib/restream/capture";
import {captureTokenFromRequest, isProgramAuthorized} from "@/lib/restream/program-auth";

const NO_STORE = "no-store";
const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: {"Cache-Control": NO_STORE},
    });
}

async function authorizeProgramRequest(
    request: Request,
    admin: boolean,
): Promise<boolean> {
    return isProgramAuthorized({
        admin,
        expectedToken: await resolveRestreamCaptureToken(),
        providedToken: captureTokenFromRequest(request),
    });
}

function encodeAlert(alert: OverlayAlert): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(alert)}\n\n`);
}

function encodeHeartbeat(): Uint8Array {
    return encoder.encode(": heartbeat\n\n");
}

export async function programAlertsSseResponse(
    request: Request,
    options: {admin: boolean},
): Promise<Response> {
    if (!(await authorizeProgramRequest(request, options.admin))) {
        return notFound();
    }

    let unsubscribe: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    function teardown(): void {
        if (closed) {
            return;
        }
        closed = true;
        unsubscribe?.();
        if (heartbeat !== undefined) {
            clearInterval(heartbeat);
            heartbeat = undefined;
        }
    }

    request.signal.addEventListener("abort", teardown, {once: true});
    if (request.signal.aborted) {
        teardown();
        return notFound();
    }

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
            const send = (chunk: Uint8Array) => {
                if (closed) {
                    return;
                }
                try {
                    controller.enqueue(chunk);
                } catch {
                    teardown();
                }
            };
            for (const alert of peekReplayableOverlayAlerts()) {
                send(encodeAlert(alert));
            }
            unsubscribe = subscribeOverlayAlerts((alert) => {
                send(encodeAlert(alert));
            });
            heartbeat = setInterval(() => {
                send(encodeHeartbeat());
            }, HEARTBEAT_MS);
            if (typeof heartbeat === "object" && "unref" in heartbeat) {
                heartbeat.unref();
            }
        },
        cancel() {
            teardown();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": NO_STORE,
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
