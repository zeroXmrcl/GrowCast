import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    climateBadge,
    climateMetrics,
    formatHumidityPct,
    formatTempC,
    formatVpd,
} from "@/lib/live-climate-view";
import {OVERLAY_LIVE_PULSE_MS} from "@/lib/overlay-motion";

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
    const live = badge.kind === "live";

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            <div className="mb-2 flex items-center gap-2">
                <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                        live ? "overlay-live-dot bg-emerald-400" : "bg-zinc-500"
                    }`}
                    style={live ? {animationDuration: `${OVERLAY_LIVE_PULSE_MS}ms`} : undefined}
                />
                <p
                    className={`text-xs font-semibold tracking-wide ${
                        live ? "text-emerald-400" : "text-zinc-400"
                    }`}
                >
                    {badge.text}
                </p>
            </div>
            <div className="flex gap-4">
                <Metric label="Temp" value={formatTempC(metrics.tempC)}/>
                <Metric label="RH" value={formatHumidityPct(metrics.humidityPct)}/>
                <Metric label="VPD" value={formatVpd(metrics.vpd)}/>
            </div>
        </section>
    );
}
