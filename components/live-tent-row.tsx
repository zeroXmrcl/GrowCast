"use client";

import {useEffect, useState} from "react";
import LiveClimateCard from "@/components/live-climate-card";
import LiveDevicesCard from "@/components/live-devices-card";
import {useLiveClimate} from "@/hooks/use-live-climate";
import type {ClimateTick} from "@/lib/climate-tick";
import type {DevicesDesign} from "@/lib/devices-design";
import {
    OVERLAY_GROW_PATH,
    OVERLAY_GROW_POLL_MS,
    parseOverlayGrowBody,
} from "@/lib/overlay-grow";
import {shouldShowLiveRow} from "@/lib/live-climate-view";
import {WORKSPACE_AREA, WORKSPACE_VT} from "@/lib/workspace";

export default function LiveTentRow({
    climateTick: initialTick = "plain",
    devicesDesign: initialDesign = "needle",
}: {
    climateTick?: ClimateTick;
    devicesDesign?: DevicesDesign;
}) {
    const {snapshot, stale, nowMs} = useLiveClimate();
    const [climateTick, setClimateTick] = useState(initialTick);
    const [devicesDesign, setDevicesDesign] = useState(initialDesign);

    useEffect(() => {
        setClimateTick(initialTick);
    }, [initialTick]);

    useEffect(() => {
        setDevicesDesign(initialDesign);
    }, [initialDesign]);

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
                    setDevicesDesign(parsed.devicesDesign);
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
        <section className={`${WORKSPACE_AREA.live} ${WORKSPACE_VT.mid} grid lg:grid-cols-2`}>
            <LiveClimateCard
                snapshot={snapshot}
                stale={stale}
                nowMs={nowMs}
                climateTick={climateTick}
            />
            <LiveDevicesCard snapshot={snapshot} devicesDesign={devicesDesign}/>
        </section>
    );
}
