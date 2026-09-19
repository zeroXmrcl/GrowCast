"use client";

import {useEffect, useState} from "react";
import LiveClimateCard from "@/components/live-climate-card";
import LiveDevicesCard from "@/components/live-devices-card";
import {useLiveClimate} from "@/hooks/use-live-climate";
import type {ClimateTick} from "@/lib/climate-tick";
import {
    OVERLAY_GROW_PATH,
    OVERLAY_GROW_POLL_MS,
    parseOverlayGrowBody,
} from "@/lib/overlay-grow";
import {shouldShowLiveRow} from "@/lib/live-climate-view";

export default function LiveTentRow({
    climateTick: initialTick = "plain",
}: {
    climateTick?: ClimateTick;
}) {
    const {snapshot, stale, nowMs} = useLiveClimate();
    const [climateTick, setClimateTick] = useState(initialTick);

    useEffect(() => {
        setClimateTick(initialTick);
    }, [initialTick]);

    useEffect(() => {
        const abort = new AbortController();
        async function poll() {
            try {
                const response = await fetch(OVERLAY_GROW_PATH, {
                    cache: "no-store",
                    signal: abort.signal,
                });
                if (!response.ok) {
                    return;
                }
                const parsed = parseOverlayGrowBody(await response.json());
                if (parsed) {
                    setClimateTick(parsed.climateTick);
                }
            } catch {
                // next interval retries
            }
        }
        void poll();
        const timer = window.setInterval(poll, OVERLAY_GROW_POLL_MS);
        return () => {
            abort.abort();
            window.clearInterval(timer);
        };
    }, []);

    if (!shouldShowLiveRow(snapshot)) {
        return null;
    }

    return (
        <section className="grid gap-6 lg:grid-cols-2">
            <LiveClimateCard
                snapshot={snapshot}
                stale={stale}
                nowMs={nowMs}
                climateTick={climateTick}
            />
            <LiveDevicesCard snapshot={snapshot}/>
        </section>
    );
}
