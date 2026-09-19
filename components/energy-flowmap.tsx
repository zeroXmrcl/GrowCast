import type {EnergyFlowRow, EnergyFlowView} from "@/lib/energy/types";

function padHour(hour: number): string {
    return String(hour).padStart(2, "0");
}

function nodeClass(row: EnergyFlowRow): string {
    const last = row.cells[row.cells.length - 1];
    if (last?.alert > 0) {
        return "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300";
    }
    if (row.cells.some((cell) => cell.duty > 0)) {
        return "bg-[#0c7700]/15 text-[#0c7700] dark:bg-[#0c7700]/35 dark:text-[#cfe3c6]";
    }
    return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
}

function Stream({row}: {row: EnergyFlowRow}) {
    return (
        <div className="flex h-3.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
            {row.cells.map((cell, index) => {
                const rest = Math.max(0, 1 - cell.duty - cell.alert);
                return (
                    <div key={index} className="flex min-w-0 flex-1">
                        {cell.duty > 0 ? (
                            <div className="bg-[#0c7700]" style={{flex: cell.duty}}/>
                        ) : null}
                        {cell.alert > 0 ? (
                            <div className="bg-[#8b2e2e] dark:bg-[#7a3535]" style={{flex: cell.alert}}/>
                        ) : null}
                        {rest > 0 ? <div style={{flex: rest}}/> : null}
                    </div>
                );
            })}
        </div>
    );
}

export default function EnergyFlowmap({flow}: {flow: EnergyFlowView}) {
    const hours = flow.columns.map((column) => column.hour);
    const start = hours[0];
    const mid = hours[Math.floor((hours.length - 1) / 2)];
    const end = hours[hours.length - 1];

    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
            {flow.rows.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No actuator runtime yet.</p>
            ) : (
                <div className="space-y-2">
                    {flow.rows.map((row) => {
                        const last = row.cells[row.cells.length - 1];
                        return (
                            <div
                                key={`${row.name}:${row.id}`}
                                className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3"
                            >
                                <p className={`truncate rounded-lg px-2 py-1 text-[11px] ${nodeClass(row)}`}>
                                    {row.label}
                                    {last?.mark ? ` ${last.mark}` : ""}
                                </p>
                                <Stream row={row}/>
                            </div>
                        );
                    })}
                    {hours.length > 0 ? (
                        <div className="flex justify-between pl-[7.75rem] font-mono text-[10px] leading-none text-zinc-400">
                            <span>{padHour(start)}</span>
                            <span>{padHour(mid)}</span>
                            <span>{padHour(end)}</span>
                        </div>
                    ) : null}
                </div>
            )}
        </section>
    );
}
