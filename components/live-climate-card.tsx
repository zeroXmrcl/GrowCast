import ClimatePickerValue from "@/components/climate-picker";
import type {ClimateTick} from "@/lib/climate-tick";
import {
    climateHistoryOpenLabel,
    type ClimateHistoryMetric,
} from "@/lib/climate/history-ui";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    climateMetricAlerts,
    climateMetrics,
    formatHumidityPctTenths,
    formatTempC,
    formatVpd,
} from "@/lib/live-climate-view";
import {WORKSPACE_PAD, WORKSPACE_SPLIT_MID} from "@/lib/workspace";
import type {ReactNode} from "react";

type LiveClimateCardProps = {
    snapshot: GgsLivePublic;
    stale: boolean;
    climateTick?: ClimateTick;
    historyOpen?: boolean;
    historyMetric?: ClimateHistoryMetric | null;
    onOpenHistory?: (metric: ClimateHistoryMetric, button: HTMLButtonElement) => void;
    preview?: boolean;
};

function Metric({
    label,
    metric,
    alerting,
    stale,
    open,
    onOpen,
    children,
}: {
    label: string;
    metric: ClimateHistoryMetric;
    alerting: boolean;
    stale: boolean;
    open: boolean;
    onOpen?: (metric: ClimateHistoryMetric, button: HTMLButtonElement) => void;
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
    const body = (
        <>
            <span className={`block text-sm ${color}`}>{label}</span>
            <span className={`block ${valueColor}`}>{children}</span>
        </>
    );
    if (!onOpen) {
        return <div>{body}</div>;
    }
    return (
        <button
            type="button"
            aria-label={climateHistoryOpenLabel(metric)}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={(event) => onOpen(metric, event.currentTarget)}
            className="growcast-climate-history-trigger"
        >
            {body}
        </button>
    );
}

export default function LiveClimateCard({
    snapshot,
    stale,
    climateTick = "plain",
    historyOpen,
    historyMetric,
    onOpenHistory,
    preview = false,
}: LiveClimateCardProps) {
    const metrics = climateMetrics(snapshot);
    const alerts = climateMetricAlerts(snapshot);
    const picker = climateTick === "picker";

    return (
        <article className={`${WORKSPACE_PAD} ${WORKSPACE_SPLIT_MID}`}>
            <h2 className="mb-4 flex items-baseline gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Climate
                {preview ? (
                    <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">Sample</span>
                ) : null}
            </h2>
            <div className="grid grid-cols-3 gap-3">
                <Metric
                    label="Temp"
                    metric="tempC"
                    alerting={alerts.temp}
                    stale={stale}
                    open={Boolean(historyOpen && historyMetric === "tempC")}
                    onOpen={onOpenHistory}
                >
                    {picker ? (
                        <ClimatePickerValue kind="temp" value={metrics.tempC} size="dash"/>
                    ) : (
                        <span className="mt-1 block text-xl font-semibold tabular-nums">
                            {formatTempC(metrics.tempC)}
                        </span>
                    )}
                </Metric>
                <Metric
                    label="Humidity"
                    metric="humidityPct"
                    alerting={alerts.humidity}
                    stale={stale}
                    open={Boolean(historyOpen && historyMetric === "humidityPct")}
                    onOpen={onOpenHistory}
                >
                    {picker ? (
                        <ClimatePickerValue kind="rh" value={metrics.humidityPct} size="dash"/>
                    ) : (
                        <span className="mt-1 block text-xl font-semibold tabular-nums">
                            {formatHumidityPctTenths(metrics.humidityPct)}
                        </span>
                    )}
                </Metric>
                <Metric
                    label="VPD"
                    metric="vpd"
                    alerting={alerts.vpd}
                    stale={stale}
                    open={Boolean(historyOpen && historyMetric === "vpd")}
                    onOpen={onOpenHistory}
                >
                    {picker ? (
                        <ClimatePickerValue kind="vpd" value={metrics.vpd} size="dash"/>
                    ) : (
                        <span className="mt-1 block text-xl font-semibold tabular-nums">
                            {formatVpd(metrics.vpd)}
                        </span>
                    )}
                </Metric>
            </div>
        </article>
    );
}
