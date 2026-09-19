"use client";

import {APP_TIMEZONE} from "@/lib/app-timezone";
import {berlinHour} from "@/lib/energy/berlin";
import {formatKwh} from "@/lib/energy/format";
import type {EnergyWaterView, EnergyWaterWindows} from "@/lib/energy/types";

const PLOT_H = 160;
const PLOT_W = 600;
const HOUR_MAX_LITERS = 0.45;

type WindowKey = keyof EnergyWaterWindows;

const CHIPS: {key: WindowKey; label: string}[] = [
    {key: "today", label: "24h"},
    {key: "7d", label: "7 days"},
    {key: "30d", label: "30 days"},
    {key: "grow", label: "This grow"},
];

function padHour(hour: number): string {
    return String(hour).padStart(2, "0");
}

function formatMl(liters: number): string {
    const ml = Math.round(liters * 1000);
    return `${ml} ml`;
}

function formatLitersExact(liters: number): string {
    const text = liters.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    return `${text} L`;
}

function formatAxisLiters(liters: number): string {
    if (!(liters > 0)) {
        return "0";
    }
    if (liters < 1) {
        return `${Math.round(liters * 1000)} ml`;
    }
    const rounded = Math.round(liters * 10) / 10;
    return `${rounded} L`;
}

function scaleMax(kind: EnergyWaterView["kind"]): number {
    if (kind === "hour") {
        return HOUR_MAX_LITERS;
    }
    if (kind === "slot6h") {
        return HOUR_MAX_LITERS * 6;
    }
    return HOUR_MAX_LITERS * 24;
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

function axisLabels(view: EnergyWaterView): {start: string; mid: string; end: string} {
    const columns = view.columns;
    if (columns.length === 0) {
        return {start: "", mid: "", end: ""};
    }
    const mid = columns[Math.floor((columns.length - 1) / 2)];
    if (view.kind === "hour") {
        return {
            start: padHour(columns[0].hour),
            mid: padHour(mid.hour),
            end: padHour(columns[columns.length - 1].hour),
        };
    }
    const withYear = berlinYear(columns[0].t) !== berlinYear(columns[columns.length - 1].t);
    return {
        start: formatDayLabel(columns[0].t, withYear),
        mid: formatDayLabel(mid.t, withYear),
        end: formatDayLabel(columns[columns.length - 1].t, withYear),
    };
}

function tooltipText(view: EnergyWaterView, index: number): string {
    const column = view.columns[index];
    const cell = view.cells[index];
    const amount = `${formatMl(cell.liters)} · ${formatLitersExact(cell.liters)}`;
    const when =
        view.kind === "day"
            ? formatDayLabel(column.t, false)
            : view.kind === "slot6h"
              ? `${formatDayLabel(column.t, false)} ${padHour(berlinHour(Date.parse(column.t)))}:00`
              : `${padHour(column.hour)}:00`;
    if (cell.empty) {
        return `${when} · EMPTY · ${amount}`;
    }
    return `${when} · ${amount}`;
}

export default function EnergyWater({
    water,
    windowKey,
    onWindowKey,
}: {
    water: EnergyWaterWindows;
    windowKey: WindowKey;
    onWindowKey: (key: WindowKey) => void;
}) {
    const selected = water[windowKey] ?? water.today;
    const labels = axisLabels(selected);
    const maxLiters = scaleMax(selected.kind);

    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Water Usage</h2>
                <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                    {formatKwh(selected.liters)} L
                </p>
            </div>
            <div className="relative z-10 mb-4 flex flex-wrap gap-2">
                {CHIPS.map((chip) => {
                    const pressed = chip.key === windowKey;
                    return (
                        <button
                            key={chip.key}
                            type="button"
                            aria-pressed={pressed}
                            onPointerDown={(event) => {
                                event.preventDefault();
                                onWindowKey(chip.key);
                            }}
                            onClick={() => onWindowKey(chip.key)}
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
            <div className="flex">
                <div
                    className="flex w-12 shrink-0 flex-col justify-between pr-1 text-right text-[10px] leading-none text-zinc-400"
                    style={{height: PLOT_H}}
                >
                    <span>{formatAxisLiters(maxLiters)}</span>
                    <span>{formatAxisLiters(maxLiters / 2)}</span>
                    <span>0</span>
                </div>
                <div className="relative min-w-0 flex-1" style={{height: PLOT_H}}>
                    <svg
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
                        preserveAspectRatio="none"
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
                    </svg>
                    <div className="absolute inset-0 flex items-end gap-[3px]">
                        {selected.cells.map((cell, index) => {
                            const pct = Math.min(100, (Math.max(0, cell.liters) / maxLiters) * 100);
                            const label = tooltipText(selected, index);
                            return (
                                <button
                                    key={selected.columns[index]?.t ?? index}
                                    type="button"
                                    aria-label={label}
                                    className="group relative z-[1] flex h-full min-w-0 flex-1 items-end border-0 bg-transparent p-0 outline-none"
                                >
                                    {pct > 0 ? (
                                        <div
                                            className="w-full rounded-sm bg-[#2c6e8a] dark:bg-[#7eb6d9]"
                                            style={{height: `${pct}%`}}
                                        />
                                    ) : null}
                                    <span className="pointer-events-none absolute left-1/2 top-1 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs tabular-nums text-white group-hover:block group-focus:block dark:bg-zinc-100 dark:text-zinc-900">
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
            {selected.columns.length > 0 ? (
                <div className="mt-1 flex justify-between pl-12 font-mono text-[10px] leading-none text-zinc-400">
                    <span>{labels.start}</span>
                    <span>{labels.mid}</span>
                    <span>{labels.end}</span>
                </div>
            ) : null}
        </section>
    );
}
