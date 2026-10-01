import ClimatePickerValue from "@/components/climate-picker";
import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import type {ClimateTick} from "@/lib/climate-tick";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
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
    stale,
    children,
}: {
    label: string;
    alerting: boolean;
    stale: boolean;
    children: ReactNode;
}) {
    const alarm = alerting && !stale;
    const color = alarm ? "growcast-alert-pulse text-red-400" : "text-zinc-400";
    const valueColor = stale
        ? "growcast-stale-pulse text-zinc-400"
        : alarm
            ? "growcast-alert-pulse text-red-400"
            : "text-zinc-50";
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
    climateTick = "plain",
}: {
    snapshot: GgsLivePublic;
    stale: boolean;
    climateTick?: ClimateTick;
}) {
    const metrics = climateMetrics(snapshot);
    const alerts = climateMetricAlerts(snapshot);
    const picker = climateTick === "picker";

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            <div className="flex gap-4">
                <Metric label="Temp" alerting={alerts.temp} stale={stale}>
                    {picker ? (
                        <ClimatePickerValue kind="temp" value={metrics.tempC}/>
                    ) : (
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {formatTempC(metrics.tempC)}
                        </p>
                    )}
                </Metric>
                <Metric label="RH" alerting={alerts.humidity} stale={stale}>
                    {picker ? (
                        <ClimatePickerValue kind="rh" value={metrics.humidityPct}/>
                    ) : (
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {formatHumidityPctTenths(metrics.humidityPct)}
                        </p>
                    )}
                </Metric>
                <Metric label="VPD" alerting={alerts.vpd} stale={stale}>
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
