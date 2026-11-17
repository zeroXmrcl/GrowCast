import {readPluginLive} from "@/lib/plugins/store";
import {PLUGIN_HEARTBEAT_MS, type PluginLiveState} from "@/lib/plugins/types";

type Subscriber = (state: PluginLiveState) => void;

const hubs = new Map<string, Set<Subscriber>>();

export function subscribePluginLive(pluginId: string, fn: Subscriber): () => void {
    let set = hubs.get(pluginId);
    if (!set) {
        set = new Set();
        hubs.set(pluginId, set);
    }
    set.add(fn);
    return () => {
        set?.delete(fn);
        if (set && set.size === 0) {
            hubs.delete(pluginId);
        }
    };
}

export async function publishPluginLive(pluginId: string): Promise<void> {
    const state = await readPluginLive(pluginId);
    const set = hubs.get(pluginId);
    if (!set) {
        return;
    }
    for (const fn of set) {
        fn(state);
    }
}

export function pluginLiveSseResponse(pluginId: string, request?: Request): Response {
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (event: string, state: PluginLiveState) => {
                if (closed) {
                    return;
                }
                const payload = `event: ${event}\ndata: ${JSON.stringify(state)}\n\n`;
                controller.enqueue(new TextEncoder().encode(payload));
            };
            void readPluginLive(pluginId).then((state) => send("snapshot", state));
            unsubscribe = subscribePluginLive(pluginId, (state) => send("snapshot", state));
            timer = setInterval(() => {
                void readPluginLive(pluginId).then((state) => send("heartbeat", state));
            }, PLUGIN_HEARTBEAT_MS);
            request?.signal.addEventListener("abort", () => {
                closed = true;
                unsubscribe?.();
                if (timer) {
                    clearInterval(timer);
                }
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            }, {once: true});
        },
        cancel() {
            closed = true;
            unsubscribe?.();
            if (timer) {
                clearInterval(timer);
            }
        },
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
        },
    });
}
