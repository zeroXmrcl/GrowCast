import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    climateBadge,
    climateMetrics,
    formatHumidityPctTenths,
    formatTempC,
    formatVpd,
} from "@/lib/live-climate-view";

function Metric({label, value}: {label: string; value: string}) {
    return (
        <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-50">{value}</p>
        </div>
    );
}

export default function OverlayClimate({
    snapshot,
    stale,
    nowMs,
}: {
    snapshot: GgsLivePublic;
    stale: boolean;
    nowMs: number;
}) {
    const metrics = climateMetrics(snapshot);
    const badge = climateBadge(stale, snapshot.updatedAt, nowMs);
    const showStale = badge.kind !== "live";

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            {showStale ? (
                <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-400">{badge.text}</p>
            ) : null}
            <div className="flex gap-4">
                <Metric label="Temp" value={formatTempC(metrics.tempC)}/>
                <Metric label="RH" value={formatHumidityPctTenths(metrics.humidityPct)}/>
                <Metric label="VPD" value={formatVpd(metrics.vpd)}/>
            </div>
        </section>
    );
}
