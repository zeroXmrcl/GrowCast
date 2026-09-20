import ClimatePickerValue from "@/components/climate-picker";
import type {ClimateTick} from "@/lib/climate-tick";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    climateBadge,
    climateMetricAlerts,
    climateMetrics,
    formatHumidityPctTenths,
    formatTempC,
    formatVpd,
} from "@/lib/live-climate-view";
import {WORKSPACE_PAD, WORKSPACE_SPLIT_MID, WORKSPACE_TITLE} from "@/lib/workspace";
import type {ReactNode} from "react";

type LiveClimateCardProps = {
    snapshot: GgsLivePublic;
    stale: boolean;
    nowMs: number;
    climateTick?: ClimateTick;
};

function Metric({
    label,
    alerting,
    children,
}: {
    label: string;
    alerting: boolean;
    children: ReactNode;
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
            <div className={valueColor}>{children}</div>
        </div>
    );
}

export default function LiveClimateCard({
    snapshot,
    stale,
    nowMs,
    climateTick = "plain",
}: LiveClimateCardProps) {
    const metrics = climateMetrics(snapshot);
    const badge = climateBadge(stale, snapshot.updatedAt, nowMs);
    const alerts = climateMetricAlerts(snapshot);
    const picker = climateTick === "picker";

    return (
        <article className={`${WORKSPACE_PAD} ${WORKSPACE_SPLIT_MID}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className={`${WORKSPACE_TITLE} mb-0`}>Climate</h2>
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
                <Metric label="Temp" alerting={alerts.temp}>
                    {picker ? (
                        <ClimatePickerValue kind="temp" value={metrics.tempC} size="dash"/>
                    ) : (
                        <p className="mt-1 text-xl font-semibold tabular-nums">
                            {formatTempC(metrics.tempC)}
                        </p>
                    )}
                </Metric>
                <Metric label="Humidity" alerting={alerts.humidity}>
                    {picker ? (
                        <ClimatePickerValue kind="rh" value={metrics.humidityPct} size="dash"/>
                    ) : (
                        <p className="mt-1 text-xl font-semibold tabular-nums">
                            {formatHumidityPctTenths(metrics.humidityPct)}
                        </p>
                    )}
                </Metric>
                <Metric label="VPD" alerting={alerts.vpd}>
                    {picker ? (
                        <ClimatePickerValue kind="vpd" value={metrics.vpd} size="dash"/>
                    ) : (
                        <p className="mt-1 text-xl font-semibold tabular-nums">
                            {formatVpd(metrics.vpd)}
                        </p>
                    )}
                </Metric>
            </div>
        </article>
    );
}
