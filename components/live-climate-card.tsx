import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    climateBadge,
    climateMetricAlerts,
    climateMetrics,
    formatHumidityPct,
    formatTempC,
    formatVpd,
} from "@/lib/live-climate-view";

type LiveClimateCardProps = {
    snapshot: GgsLivePublic;
    stale: boolean;
    nowMs: number;
};

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
        ? "growcast-alert-pulse text-red-600 dark:text-red-400"
        : "text-zinc-500 dark:text-zinc-400";
    const valueColor = alerting
        ? "growcast-alert-pulse text-red-600 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-100";
    return (
        <div>
            <p className={`text-sm ${color}`}>{label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
        </div>
    );
}

export default function LiveClimateCard({snapshot, stale, nowMs}: LiveClimateCardProps) {
    const metrics = climateMetrics(snapshot);
    const badge = climateBadge(stale, snapshot.updatedAt, nowMs);
    const alerts = climateMetricAlerts(snapshot);

    return (
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Climate</h2>
                <p
                    className={`text-xs font-semibold tracking-wide ${
                        badge.kind === "live"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-zinc-500 dark:text-zinc-400"
                    }`}
                >
                    {badge.text}
                </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <Metric label="Temp" value={formatTempC(metrics.tempC)} alerting={alerts.temp}/>
                <Metric
                    label="Humidity"
                    value={formatHumidityPct(metrics.humidityPct)}
                    alerting={alerts.humidity}
                />
                <Metric label="VPD" value={formatVpd(metrics.vpd)} alerting={alerts.vpd}/>
            </div>
        </article>
    );
}
