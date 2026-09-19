import ClimatePickerValue from "@/components/climate-picker";
import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
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
import type {ReactNode} from "react";

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
        ? "growcast-alert-pulse text-red-400"
        : "text-zinc-400";
    const valueColor = alerting ? "growcast-alert-pulse text-red-400" : "text-zinc-50";
    return (
        <div>
            <p className={`text-[11px] font-medium uppercase tracking-wide ${color}`}>{label}</p>
            <div className={valueColor}>{children}</div>
        </div>
    );
}

export default function OverlayClimate({
    snapshot,
    stale,
    nowMs,
    climateTick = "plain",
}: {
    snapshot: GgsLivePublic;
    stale: boolean;
    nowMs: number;
    climateTick?: ClimateTick;
}) {
    const metrics = climateMetrics(snapshot);
    const badge = climateBadge(stale, snapshot.updatedAt, nowMs);
    const showStale = badge.kind !== "live";
    const alerts = climateMetricAlerts(snapshot);
    const picker = climateTick === "picker";

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            {showStale ? (
                <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-400">{badge.text}</p>
            ) : null}
            <div className="flex gap-4">
                <Metric label="Temp" alerting={alerts.temp}>
                    {picker ? (
                        <ClimatePickerValue kind="temp" value={metrics.tempC}/>
                    ) : (
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {formatTempC(metrics.tempC)}
                        </p>
                    )}
                </Metric>
                <Metric label="RH" alerting={alerts.humidity}>
                    {picker ? (
                        <ClimatePickerValue kind="rh" value={metrics.humidityPct}/>
                    ) : (
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {formatHumidityPctTenths(metrics.humidityPct)}
                        </p>
                    )}
                </Metric>
                <Metric label="VPD" alerting={alerts.vpd}>
                    {picker ? (
                        <ClimatePickerValue kind="vpd" value={metrics.vpd}/>
                    ) : (
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {formatVpd(metrics.vpd)}
                        </p>
                    )}
                </Metric>
            </div>
        </section>
    );
}
