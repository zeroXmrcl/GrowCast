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
