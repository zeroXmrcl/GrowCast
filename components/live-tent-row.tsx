"use client";

import LiveClimateCard from "@/components/live-climate-card";
import LiveDevicesCard from "@/components/live-devices-card";
import {useLiveClimate} from "@/hooks/use-live-climate";
import {shouldShowLiveRow} from "@/lib/live-climate-view";

export default function LiveTentRow() {
    const {snapshot, stale, nowMs} = useLiveClimate();

    if (!shouldShowLiveRow(snapshot)) {
        return null;
    }

    return (
        <section className="grid gap-6 lg:grid-cols-2">
            <LiveClimateCard snapshot={snapshot} stale={stale} nowMs={nowMs}/>
            <LiveDevicesCard snapshot={snapshot}/>
        </section>
    );
}
