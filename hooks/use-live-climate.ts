"use client";

import {useEffect, useState} from "react";
import {parsePublicLiveBody, type GgsLivePublic} from "@/lib/ggs-live";
import {isClimateStale, preferLiveSnapshot} from "@/lib/live-climate-view";

const LIVE_CLIMATE_URL = "/api/data/live-climate";
const LIVE_CLIMATE_STREAM_URL = "/api/data/live-climate/stream";

export function asLivePublic(raw: unknown): GgsLivePublic | null {
    const parsed = parsePublicLiveBody(raw);
    return parsed.ok ? parsed.value : null;
}

export async function recoverLiveClimateOnSseFailure(input: {
    reason: number | "error";
    current: GgsLivePublic | null;
    fetch: typeof fetch;
    url?: string;
    signal?: AbortSignal;
}): Promise<GgsLivePublic | null> {
    if (input.reason !== 503 && input.reason !== "error") {
        return input.current;
    }
    try {
        const response = await input.fetch(input.url ?? LIVE_CLIMATE_URL, {
            cache: "no-store",
            headers: {Accept: "application/json"},
            signal: input.signal,
        });
        if (!response.ok) {
            return input.current;
        }
        const parsed = asLivePublic(await response.json());
        if (!parsed) {
            return input.current;
        }
        return preferLiveSnapshot(input.current, parsed);
    } catch {
        return input.current;
    }
}

export function useLiveClimate(): {
    snapshot: GgsLivePublic | null;
    stale: boolean;
    nowMs: number;
} {
    const [snapshot, setSnapshot] = useState<GgsLivePublic | null>(null);
    const [lastEventAtMs, setLastEventAtMs] = useState<number | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        const abort = new AbortController();
        let source: EventSource | null = null;
        let cancelled = false;
        let sseHasApplied = false;
        let latest: GgsLivePublic | null = null;

        function apply(next: GgsLivePublic, heardAt: number, sourceKind: "get" | "sse") {
            if (cancelled) {
                return;
            }
            if (sourceKind === "get" && sseHasApplied) {
                return;
            }
            const chosen = preferLiveSnapshot(latest, next);
            latest = chosen;
            if (sourceKind === "sse") {
                sseHasApplied = true;
                setSnapshot(chosen);
                setLastEventAtMs(heardAt);
                return;
            }
            if (chosen !== next) {
                return;
            }
            setSnapshot(chosen);
            setLastEventAtMs(heardAt);
        }

        async function loadInitial() {
            try {
                const response = await fetch(LIVE_CLIMATE_URL, {
                    cache: "no-store",
                    headers: {Accept: "application/json"},
                    signal: abort.signal,
                });
                if (!response.ok) {
                    return;
                }
                const parsed = asLivePublic(await response.json());
                if (parsed) {
                    apply(parsed, Date.now(), "get");
                }
            } catch {
            }
        }

        void loadInitial();

        source = new EventSource(LIVE_CLIMATE_STREAM_URL);
        const onEvent = (event: MessageEvent) => {
            const heardAt = Date.now();
            let raw: unknown;
            try {
                raw = JSON.parse(event.data) as unknown;
            } catch {
                if (!cancelled) {
                    setLastEventAtMs(heardAt);
                }
                return;
            }
            const parsed = asLivePublic(raw);
            if (parsed) {
                apply(parsed, heardAt, "sse");
                return;
            }
            if (!cancelled) {
                setLastEventAtMs(heardAt);
            }
        };
        source.addEventListener("snapshot", onEvent);
        source.addEventListener("heartbeat", onEvent);
        source.onerror = () => {
            sseHasApplied = false;
            void recoverLiveClimateOnSseFailure({
                reason: "error",
                current: latest,
                fetch,
                signal: abort.signal,
            }).then((next) => {
                if (cancelled || !next) {
                    return;
                }
                latest = next;
                setSnapshot(next);
                setLastEventAtMs(Date.now());
            });
        };

        const tick = setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => {
            cancelled = true;
            abort.abort();
            source?.close();
            clearInterval(tick);
        };
    }, []);

    return {
        snapshot,
        stale: isClimateStale(snapshot, nowMs, lastEventAtMs),
        nowMs,
    };
}
