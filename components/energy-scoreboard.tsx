import Link from "next/link";
import {
    formatEur,
    formatHoursOn,
    formatKwh,
    formatSharePct,
    formatTariffRate,
    formatWatts,
} from "@/lib/energy/format";
import type {EnergyGrowOption} from "@/lib/energy/scoreboard";
import type {EnergyPublicDto, EnergyWindow} from "@/lib/energy/types";

type EnergyScoreboardProps = {
    dto: EnergyPublicDto;
    grows: EnergyGrowOption[];
};

function tariffCaption(dto: EnergyPublicDto): string {
    const kind = dto.tariffKind === "private" ? "Private tariff" : "Public tariff";
    return `${kind} ${formatTariffRate(dto.appliedTariffEurPerKwh)}`;
}

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

export default function EnergyScoreboard({dto, grows}: EnergyScoreboardProps) {
    const current = dto.grow === "current";
    const switcher = [
        {id: "current", href: "/energy", label: "This grow"},
        ...grows.map((grow) => ({
            id: grow.id,
            href: `/energy?grow=${encodeURIComponent(grow.id)}`,
            label: grow.label,
        })),
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Energy
                    </h1>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        Estimated · {tariffCaption(dto)}
                    </p>
                </div>
                {switcher.length > 1 ? (
                    <nav className="flex flex-wrap gap-2" aria-label="Grow">
                        {switcher.map((item) => {
                            const active = item.id === dto.grow || (current && item.id === "current");
                            return (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    className={`rounded-full border px-3 py-1 text-sm ${
                                        active
                                            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                            : "border-zinc-200 text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300"
                                    }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                ) : null}
            </div>

            {dto.empty ? (
                <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                    Energy starts when live devices are flowing.
                </p>
            ) : current && dto.windows ? (
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
            ) : (
                <section className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
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
                </section>
            )}

            {!dto.empty && dto.startedAt && current ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Since {dto.startedAt}
                </p>
            ) : null}

            {dto.empty ? null : (
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
            )}
        </div>
    );
}
