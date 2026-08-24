"use client";

import {useEffect, useState, type PointerEvent} from "react";
import {APP_TIMEZONE} from "@/lib/app-timezone";
import {berlinHour} from "@/lib/energy/berlin";
import {ENERGY_POLL_MS, fetchEnergyDto, shouldPollEnergy} from "@/lib/energy/poll";
import {
    formatEur,
    formatHoursOn,
    formatKwh,
    formatSharePct,
    formatWatts,
} from "@/lib/energy/format";
import type {
    EnergyPublicDto,
    EnergySeries,
    EnergySeriesWindows,
    EnergyWindow,
} from "@/lib/energy/types";

type WindowKey = keyof EnergySeriesWindows;

const CHIPS: {key: WindowKey; label: string}[] = [
    {key: "today", label: "Today"},
    {key: "7d", label: "7 days"},
    {key: "30d", label: "30 days"},
    {key: "grow", label: "This grow"},
];

const PLOT_H = 160;
const PLOT_W = 600;

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

function padHour(hour: number): string {
    return String(hour).padStart(2, "0");
}

function formatDayLabel(iso: string, withYear: boolean): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: APP_TIMEZONE,
        day: "numeric",
        month: "short",
        ...(withYear ? {year: "numeric"} : {}),
    }).format(new Date(iso));
}

function berlinYear(iso: string): number {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: APP_TIMEZONE,
        year: "numeric",
    }).formatToParts(new Date(iso));
    return Number(parts.find((part) => part.type === "year")?.value);
}

function axisLabels(series: EnergySeries): {start: string; mid: string; end: string} {
    const points = series.points;
    if (points.length === 0) {
        return {start: "", mid: "", end: ""};
    }
    const mid = points[Math.floor((points.length - 1) / 2)];
    if (series.kind === "hour") {
        return {
            start: padHour(berlinHour(Date.parse(points[0].t))),
            mid: padHour(berlinHour(Date.parse(mid.t))),
            end: "now",
        };
    }
    if (series.kind === "slot6h") {
        const withYear = berlinYear(points[0].t) !== berlinYear(points[points.length - 1].t);
        return {
            start: formatDayLabel(points[0].t, withYear),
            mid: formatDayLabel(mid.t, withYear),
            end: "now",
        };
    }
    const withYear = berlinYear(points[0].t) !== berlinYear(points[points.length - 1].t);
    return {
        start: formatDayLabel(points[0].t, withYear),
        mid: formatDayLabel(mid.t, withYear),
        end: formatDayLabel(points[points.length - 1].t, withYear),
    };
}

function tooltipLabel(series: EnergySeries, index: number): string {
    const point = series.points[index];
    const watts = `${formatWatts(point.watts)} W`;
    if (series.kind === "hour" || series.kind === "slot6h") {
        return `${padHour(berlinHour(Date.parse(point.t)))}:00 · ${watts}`;
    }
    return `${formatDayLabel(point.t, false)} · ${watts}`;
}

function n(value: number): number {
    return Math.round(value * 100) / 100;
}

type LaidOut = {
    x0: number;
    x1: number;
    y: number;
    held: boolean;
};

function layoutPoints(points: EnergySeries["points"], yMax: number): LaidOut[] {
    const count = Math.max(points.length, 1);
    return points.map((point, i) => ({
        x0: (i / count) * PLOT_W,
        x1: ((i + 1) / count) * PLOT_W,
        y: PLOT_H - (point.watts / yMax) * PLOT_H,
        held: Boolean(point.held),
    }));
}

function groupRuns(layout: LaidOut[]): LaidOut[][] {
    const runs: LaidOut[][] = [];
    let current: LaidOut[] = [];
    let held: boolean | null = null;
    for (const point of layout) {
        if (held === null || point.held !== held) {
            if (current.length > 0) {
                runs.push(current);
            }
            current = [point];
            held = point.held;
        } else {
            current.push(point);
        }
    }
    if (current.length > 0) {
        runs.push(current);
    }
    return runs;
}

function fillPath(run: LaidOut[]): string {
    const first = run[0];
    const last = run[run.length - 1];
    let d = `M${n(first.x0)} ${n(PLOT_H)} L${n(first.x0)} ${n(first.y)} H${n(first.x1)}`;
    for (let i = 1; i < run.length; i += 1) {
        d += ` V${n(run[i].y)} H${n(run[i].x1)}`;
    }
    d += ` L${n(last.x1)} ${n(PLOT_H)} Z`;
    return d;
}

function strokePath(run: LaidOut[], prevY: number | null): string {
    const first = run[0];
    let d =
        prevY === null
            ? `M${n(first.x0)} ${n(first.y)}`
            : `M${n(first.x0)} ${n(prevY)} V${n(first.y)}`;
    d += ` H${n(first.x1)}`;
    for (let i = 1; i < run.length; i += 1) {
        d += ` V${n(run[i].y)} H${n(run[i].x1)}`;
    }
    return d;
}

function EnergyWattsPlot({series}: {series: EnergySeries}) {
    const [hover, setHover] = useState<number | null>(null);
    const points = series.points;
    const peak = points.reduce((max, point) => Math.max(max, point.watts), 0);
    const yMax = Math.max(peak, 1);
    const layout = layoutPoints(points, yMax);
    const runs = groupRuns(layout);
    const labels = axisLabels(series);
    const peakLabel = String(Math.round(yMax));
    const midLabel = String(Math.round(yMax / 2));
    const hoverBucket = hover !== null ? layout[hover] : undefined;
    const hoverX = hoverBucket ? (hoverBucket.x0 + hoverBucket.x1) / 2 : 0;

    function bucketAt(event: PointerEvent<SVGSVGElement>): number | null {
        if (points.length === 0) {
            return null;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const vx = ((event.clientX - rect.left) / rect.width) * PLOT_W;
        if (vx < 0 || vx > PLOT_W) {
            return null;
        }
        return Math.min(
            points.length - 1,
            Math.max(0, Math.floor((vx / PLOT_W) * points.length)),
        );
    }

    function onPointerMove(event: PointerEvent<SVGSVGElement>) {
        setHover(bucketAt(event));
    }

    function onPointerDown(event: PointerEvent<SVGSVGElement>) {
        setHover(bucketAt(event));
    }

    function onPointerLeave(event: PointerEvent<SVGSVGElement>) {
        if (event.pointerType === "mouse") {
            setHover(null);
        }
    }

    return (
        <div>
            <div className="flex">
                <div
                    className="flex w-9 shrink-0 flex-col justify-between pr-1 text-right text-[10px] leading-none text-zinc-400"
                    style={{height: PLOT_H}}
                >
                    <span>{peakLabel}</span>
                    <span>{midLabel}</span>
                    <span>0 W</span>
                </div>
                <div className="relative min-w-0 flex-1">
                    <svg
                        aria-hidden="true"
                        className="w-full"
                        height={PLOT_H}
                        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
                        preserveAspectRatio="none"
                        onPointerDown={onPointerDown}
                        onPointerLeave={onPointerLeave}
                        onPointerMove={onPointerMove}
                    >
                        <line
                            x1={0}
                            x2={PLOT_W}
                            y1={0}
                            y2={0}
                            className="stroke-zinc-200 dark:stroke-zinc-800"
                            strokeWidth={1}
                            vectorEffect="nonScalingStroke"
                        />
                        <line
                            x1={0}
                            x2={PLOT_W}
                            y1={PLOT_H / 2}
                            y2={PLOT_H / 2}
                            className="stroke-zinc-200 dark:stroke-zinc-800"
                            strokeWidth={1}
                            vectorEffect="nonScalingStroke"
                        />
                        <line
                            x1={0}
                            x2={PLOT_W}
                            y1={PLOT_H}
                            y2={PLOT_H}
                            className="stroke-zinc-200 dark:stroke-zinc-800"
                            strokeWidth={1}
                            vectorEffect="nonScalingStroke"
                        />
                        {runs.map((run, index) => {
                            if (run[0].held) {
                                return null;
                            }
                            return (
                                <path
                                    key={`fill-${index}`}
                                    d={fillPath(run)}
                                    className="fill-[rgba(22,163,74,0.12)] dark:fill-[rgba(74,222,128,0.15)]"
                                />
                            );
                        })}
                        {runs.map((run, index) => {
                            const prev = index === 0 ? null : runs[index - 1];
                            const prevY = prev ? prev[prev.length - 1].y : null;
                            return (
                                <path
                                    key={`line-${index}`}
                                    d={strokePath(run, prevY)}
                                    fill="none"
                                    strokeWidth={2}
                                    strokeLinejoin="miter"
                                    strokeLinecap="butt"
                                    strokeDasharray={run[0].held ? "5 4" : undefined}
                                    vectorEffect="nonScalingStroke"
                                    className="stroke-[#16a34a] dark:stroke-[#4ade80]"
                                />
                            );
                        })}
                        {hoverBucket ? (
                            <line
                                x1={hoverX}
                                x2={hoverX}
                                y1={0}
                                y2={PLOT_H}
                                className="stroke-zinc-900/40 dark:stroke-zinc-100/40"
                                strokeWidth={1}
                                vectorEffect="nonScalingStroke"
                            />
                        ) : null}
                    </svg>
                    {hover !== null && hoverBucket ? (
                        <div
                            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs tabular-nums text-white dark:bg-zinc-100 dark:text-zinc-900"
                            style={{
                                left: `${(hoverX / PLOT_W) * 100}%`,
                                top: 8,
                                transform: "translateX(-50%)",
                            }}
                        >
                            {tooltipLabel(series, hover)}
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="mt-1 flex justify-between pl-9 text-[10px] leading-none text-zinc-400">
                <span>{labels.start}</span>
                <span>{labels.mid}</span>
                <span>{labels.end}</span>
            </div>
        </div>
    );
}

function EnergyGraphCard({series}: {series: EnergySeriesWindows}) {
    const [windowKey, setWindowKey] = useState<WindowKey>("today");
    const selected = series[windowKey];

    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
            <div className="mb-4 flex flex-wrap gap-2">
                {CHIPS.map((chip) => {
                    const pressed = chip.key === windowKey;
                    return (
                        <button
                            key={chip.key}
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => setWindowKey(chip.key)}
                            className={
                                pressed
                                    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                                    : "rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                            }
                        >
                            {chip.label}
                        </button>
                    );
                })}
            </div>
            <EnergyWattsPlot key={windowKey} series={selected}/>
        </section>
    );
}

function usePolledEnergyDto(initial: EnergyPublicDto): EnergyPublicDto {
    const [dto, setDto] = useState(initial);
    useEffect(() => {
        setDto(initial);
    }, [initial]);
    useEffect(() => {
        let cancelled = false;
        async function tick() {
            if (!shouldPollEnergy(document.visibilityState === "visible")) {
                return;
            }
            const next = await fetchEnergyDto();
            if (!cancelled && next) {
                setDto(next);
            }
        }
        const id = window.setInterval(() => {
            void tick();
        }, ENERGY_POLL_MS);
        function onVisibility() {
            if (document.visibilityState === "visible") {
                void tick();
            }
        }
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            cancelled = true;
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);
    return dto;
}

export default function EnergyScoreboard({dto: initial}: {dto: EnergyPublicDto}) {
    const dto = usePolledEnergyDto(initial);
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
                    {dto.series ? <EnergyGraphCard series={dto.series}/> : null}
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
