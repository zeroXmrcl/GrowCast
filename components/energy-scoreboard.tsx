import {
    formatEur,
    formatHoursOn,
    formatKwh,
    formatSharePct,
    formatWatts,
} from "@/lib/energy/format";
import type {EnergyPublicDto, EnergyWindow} from "@/lib/energy/types";

function WindowTile({
    title,
    window,
}: {
    title: string;
    window: EnergyWindow;
}) {
    return (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {title}
            </p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatKwh(window.kWh)} kWh
            </p>
            <p className="mt-1 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                {window.costEur === null ? "—" : `${formatEur(window.costEur)} €`}
            </p>
        </div>
    );
}

function DeviceTable({dto}: {dto: EnergyPublicDto}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                        <th className="px-4 py-3 font-semibold">Device</th>
                        <th className="px-4 py-3 font-semibold">Hours on</th>
                        <th className="px-4 py-3 font-semibold">kWh</th>
                        <th className="px-4 py-3 font-semibold">€</th>
                        <th className="px-4 py-3 font-semibold">Share</th>
                    </tr>
                </thead>
                <tbody>
                    {dto.devices.length === 0 ? (
                        <tr>
                            <td
                                className="px-4 py-6 text-zinc-500 dark:text-zinc-400"
                                colSpan={5}
                            >
                                No actuator runtime logged for this grow yet.
                            </td>
                        </tr>
                    ) : (
                        dto.devices.map((row) => (
                            <tr
                                key={`${row.name}:${row.label}`}
                                className="border-t border-zinc-200 dark:border-zinc-800"
                            >
                                <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                                    <span className="font-medium">{row.label}</span>
                                    <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                                        {row.name}
                                    </span>
                                </td>
                                <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                                    {formatHoursOn(row.hoursOn)}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                                    {formatKwh(row.kWh)}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                                    {row.costEur === null ? "—" : formatEur(row.costEur)}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                                    {formatSharePct(row.sharePct)}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </section>
    );
}

export default function EnergyScoreboard({dto}: {dto: EnergyPublicDto}) {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Energy
            </h1>

            {dto.empty ? (
                <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                    Energy starts when live devices are flowing.
                </p>
            ) : dto.windows ? (
                <>
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Now
                            </p>
                            <p
                                className={`mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 ${
                                    dto.nowWattsStale ? "opacity-50" : ""
                                }`}
                            >
                                {dto.nowWatts === null ? "—" : `${formatWatts(dto.nowWatts)} W`}
                            </p>
                        </div>
                        <WindowTile title="Today" window={dto.windows.today}/>
                        <WindowTile title="7 days" window={dto.windows["7d"]}/>
                        <WindowTile title="30 days" window={dto.windows["30d"]}/>
                        <WindowTile title="This grow" window={dto.windows.grow}/>
                    </section>
                    <DeviceTable dto={dto}/>
                </>
            ) : (
                <DeviceTable dto={dto}/>
            )}
        </div>
    );
}

export function EnergyArchiveSection({dto}: {dto: EnergyPublicDto}) {
    if (dto.empty) {
        return null;
    }

    return (
        <section className="space-y-4">
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Energy
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            This grow
                        </p>
                        <p className="mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                            {formatKwh(dto.kWh)} kWh
                        </p>
                        <p className="mt-1 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                            {dto.costEur === null ? "—" : `${formatEur(dto.costEur)} €`}
                        </p>
                    </div>
                </div>
            </article>
            <DeviceTable dto={dto}/>
        </section>
    );
}
