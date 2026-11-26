import {useEffect, useState} from "react";
import {usePluginLive} from "@growcast/plugin-sdk/ui";
import type {SolarRangeId, SolarViewDto} from "./view-types";

export function sampleFlag(): boolean {
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sample") === "1";
}

export function useSolarView(range: SolarRangeId = "live"): SolarViewDto | null {
    const live = usePluginLive();
    const [view, setView] = useState<SolarViewDto | null>(null);

    useEffect(() => {
        let cancelled = false;
        const sample = sampleFlag() ? "&sample=1" : "";
        void fetch(`/api/data/plugins/${encodeURIComponent(live.pluginId)}/range?window=${range}${sample}`, {
            cache: "no-store",
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((raw) => {
                if (!cancelled && raw) {
                    setView(raw as SolarViewDto);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [live.pluginId, range, live.updatedAt]);

    return view;
}
