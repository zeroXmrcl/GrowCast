"use client";

import {useEffect, useState} from "react";
import {useAuth, usePluginLive} from "@growcast/plugin-sdk/ui";
import {EnergyNow} from "@/plugins/solar/ui/energy-now";
import {RangeBar} from "@/plugins/solar/ui/range-bar";
import {StackedHistory} from "@/plugins/solar/ui/stacked-history";
import {TentCostCard, TentDevicesCard, TentSplitCard} from "@/plugins/solar/ui/tent-panel";
import {useSolarView} from "@/plugins/solar/ui/use-solar-view";
import type {SolarRangeId} from "@/plugins/solar/ui/view-types";

function readRange(): SolarRangeId {
    if (typeof window === "undefined") {
        return "live";
    }
    const value = new URLSearchParams(window.location.search).get("range");
    if (value === "24h" || value === "7d" || value === "30d" || value === "grow" || value === "live") {
        return value;
    }
    return "live";
}

export default function SolarEnergyPage() {
    const live = usePluginLive();
    const {role} = useAuth();
    const [range, setRange] = useState<SolarRangeId>(readRange);
    const view = useSolarView(range);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        params.set("range", range);
        const next = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState(null, "", next);
    }, [range]);

    return (
        <div className="gc-solar">
            <div className="gc-solar-page">
                <header className="gc-solar-head">
                    <div>
                        <p className="gc-solar-meta">/p/solar</p>
                        <h1>Solar</h1>
                    </div>
                    <div style={{display: "grid", gap: 8, justifyItems: "end"}}>
                        <p className="gc-solar-meta">
                            {view?.sample ? "Sample data · " : ""}
                            {view?.stale ? "Stale · " : ""}
                            {view?.updatedAt ? `Updated ${view.updatedAt}` : live.updatedAt ? `Updated ${live.updatedAt}` : "Waiting for data"}
                            {view?.timezone ? ` · ${view.timezone}` : ""}
                        </p>
                        {view ? <RangeBar view={view} onChange={setRange} /> : null}
                    </div>
                </header>
                {view && range === "grow" && !view.grow.active ? (
                    <p className="gc-solar-hint">{view.growDisabledHint ?? "This Grow is bound to the current grow start date. No grow is active, so the range is disabled."}</p>
                ) : null}
                {!view ? <p className="gc-solar-hint">Loading solar…</p> : null}
                {view && range === "live" ? <EnergyNow view={view} /> : null}
                {view && range !== "live" ? <StackedHistory view={view} /> : null}
                {view ? (
                    <div className="gc-split-grid">
                        <TentSplitCard view={view} />
                        <TentCostCard view={view} />
                    </div>
                ) : null}
                {view ? <TentDevicesCard view={view} /> : null}
                {role === "admin" ? (
                    <p className="gc-solar-hint">
                        <a href="/admin/plugins/growcast.solar">Solar connection settings</a>
                    </p>
                ) : null}
            </div>
        </div>
    );
}
