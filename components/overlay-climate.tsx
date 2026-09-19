import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    climateBadge,
    climateMetricAlerts,
    climateMetrics,
    formatHumidityPctTenths,
    formatTempC,
    formatVpd,
} from "@/lib/live-climate-view";

function Metric({
    label,
    value,
    alerting,
}: {
    label: string;
    value: string;
    alerting: boolean;
}) {
    const color = alerting
        ? "growcast-alert-pulse text-red-400"
        : "text-zinc-400";
    const valueColor = alerting ? "growcast-alert-pulse text-red-400" : "text-zinc-50";
    return (
        <div>
            <p className={`text-[11px] font-medium uppercase tracking-wide ${color}`}>{label}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${valueColor}`}>{value}</p>
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
    const alerts = climateMetricAlerts(snapshot);

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            {showStale ? (
                <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-400">{badge.text}</p>
            ) : null}
            <div className="flex gap-4">
                <Metric label="Temp" value={formatTempC(metrics.tempC)} alerting={alerts.temp}/>
                <Metric
                    label="RH"
                    value={formatHumidityPctTenths(metrics.humidityPct)}
                    alerting={alerts.humidity}
                />
                <Metric label="VPD" value={formatVpd(metrics.vpd)} alerting={alerts.vpd}/>
            </div>
        </section>
    );
}
