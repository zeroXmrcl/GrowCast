import ClimatePickerValue from "@/components/climate-picker";
import type {ClimateTick} from "@/lib/climate-tick";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
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
    climateTick?: ClimateTick;
};

function Metric({
    label,
    alerting,
    stale,
    children,
}: {
    label: string;
    alerting: boolean;
    stale: boolean;
    children: ReactNode;
}) {
    const alarm = alerting && !stale;
    const color = alarm
        ? "growcast-alert-pulse text-red-600 dark:text-red-400"
        : "text-zinc-500 dark:text-zinc-400";
    const valueColor = stale
        ? "growcast-stale-pulse text-zinc-500 dark:text-zinc-400"
        : alarm
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
    climateTick = "plain",
}: LiveClimateCardProps) {
    const metrics = climateMetrics(snapshot);
    const alerts = climateMetricAlerts(snapshot);
    const picker = climateTick === "picker";

    return (
        <article className={`${WORKSPACE_PAD} ${WORKSPACE_SPLIT_MID}`}>
            <h2 className={`${WORKSPACE_TITLE} mb-4`}>Climate</h2>
            <div className="grid grid-cols-3 gap-3">
                <Metric label="Temp" alerting={alerts.temp} stale={stale}>
                    {picker ? (
                        <ClimatePickerValue kind="temp" value={metrics.tempC} size="dash"/>
                    ) : (
                        <p className="mt-1 text-xl font-semibold tabular-nums">
                            {formatTempC(metrics.tempC)}
                        </p>
                    )}
                </Metric>
                <Metric label="Humidity" alerting={alerts.humidity} stale={stale}>
                    {picker ? (
                        <ClimatePickerValue kind="rh" value={metrics.humidityPct} size="dash"/>
                    ) : (
                        <p className="mt-1 text-xl font-semibold tabular-nums">
                            {formatHumidityPctTenths(metrics.humidityPct)}
                        </p>
                    )}
                </Metric>
                <Metric label="VPD" alerting={alerts.vpd} stale={stale}>
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
