import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {formatEur, formatKwh, formatWatts} from "@/lib/energy/format";
import type {EnergyPublicDto} from "@/lib/energy/types";

export default function OverlayEnergy({dto}: {dto: EnergyPublicDto}) {
    const today = dto.windows?.today;
    const watts =
        dto.nowWatts === null ? "—" : `${formatWatts(dto.nowWatts)} W`;
    const kwh = today ? `${formatKwh(today.kWh)} kWh` : "—";
    const cost =
        today == null || today.costEur === null ? "—" : `${formatEur(today.costEur)} €`;

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
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        Today
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-50">
                        {kwh}
                    </p>
                    <p className="text-sm tabular-nums text-zinc-300">{cost}</p>
                </div>
            </div>
        </section>
    );
}
