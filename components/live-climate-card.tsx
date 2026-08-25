import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    climateBadge,
    climateMetrics,
    formatHumidityPctTenths,
    formatTempC,
    formatVpd,
} from "@/lib/live-climate-view";

type LiveClimateCardProps = {
    snapshot: GgsLivePublic;
    stale: boolean;
    nowMs: number;
};

export default function LiveClimateCard({snapshot, stale, nowMs}: LiveClimateCardProps) {
    const metrics = climateMetrics(snapshot);
    const badge = climateBadge(stale, snapshot.updatedAt, nowMs);

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
                <div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Temp</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatTempC(metrics.tempC)}
                    </p>
                </div>
                <div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Humidity</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatHumidityPctTenths(metrics.humidityPct)}
                    </p>
                </div>
                <div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">VPD</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVpd(metrics.vpd)}
                    </p>
                </div>
            </div>
        </article>
    );
}
