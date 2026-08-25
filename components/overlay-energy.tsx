import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {formatEur, formatKwh, formatWatts} from "@/lib/energy/format";
import type {EnergyPublicDto} from "@/lib/energy/types";
import {overlayEnergyGrowWindow} from "@/lib/overlay-energy-view";

function WindowColumn({
    label,
    kwh,
    costEur,
}: {
    label: string;
    kwh: string;
    costEur: string;
}) {
    return (
        <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                {label}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-50">{kwh}</p>
            <p className="text-sm tabular-nums text-zinc-300">{costEur}</p>
        </div>
    );
}

export default function OverlayEnergy({dto}: {dto: EnergyPublicDto}) {
    const today = dto.windows?.today;
    const grow = overlayEnergyGrowWindow(dto);
    const watts =
        dto.nowWatts === null ? "—" : `${formatWatts(dto.nowWatts)} W`;
    const todayKwh = today ? `${formatKwh(today.kWh)} kWh` : "—";
    const todayCost =
        today == null || today.costEur === null ? "—" : `${formatEur(today.costEur)} €`;
    const growKwh = grow ? `${formatKwh(grow.kWh)} kWh` : "—";
    const growCost =
        grow == null || grow.costEur === null ? "—" : `${formatEur(grow.costEur)} €`;

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            <div className="flex flex-wrap gap-4">
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        Now
                    </p>
                    <p
                        className={`mt-0.5 text-lg font-semibold tabular-nums text-zinc-50 ${
                            dto.nowWattsStale ? "opacity-50" : ""
                        }`}
                    >
                        {watts}
                    </p>
                </div>
                <WindowColumn label="Today" kwh={todayKwh} costEur={todayCost}/>
                {grow ? (
                    <WindowColumn label="Grow" kwh={growKwh} costEur={growCost}/>
                ) : null}
            </div>
        </section>
    );
}
