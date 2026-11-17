"use client";

import {createElement, type ReactNode} from "react";
import {usePluginLive} from "./runtime";

export function PageShell({
    title,
    updatedAt,
    stale,
    children,
}: {
    title: string;
    updatedAt?: string | null;
    stale?: boolean;
    children: ReactNode;
}) {
    return createElement(
        "main",
        {className: "mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6"},
        createElement(
            "header",
            {className: "flex flex-wrap items-end justify-between gap-3"},
            createElement("h1", {className: "text-2xl font-semibold"}, title),
            createElement(
                "p",
                {className: "text-sm text-zinc-500"},
                stale ? "Stale" : updatedAt ? `Updated ${updatedAt}` : "Waiting for data",
            ),
        ),
        children,
    );
}

export function Card({
    children,
    tone,
}: {
    children: ReactNode;
    tone?: "warning" | "default";
}) {
    const cls = tone === "warning"
        ? "rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
        : "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
    return createElement("section", {className: cls}, children);
}

export function Stat({label, value, unit}: {label: string; value: number | null | undefined; unit?: string}) {
    const text = value === null || value === undefined ? "—" : Number.isFinite(value) ? value.toFixed(1) : "—";
    return createElement(
        "div",
        {className: "rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"},
        createElement("p", {className: "text-xs uppercase tracking-wide text-zinc-500"}, label),
        createElement(
            "p",
            {className: "mt-1 text-2xl font-semibold"},
            text,
            unit ? createElement("span", {className: "ml-1 text-sm font-normal text-zinc-500"}, unit) : null,
        ),
    );
}

export function Gauge({label, value, unit}: {label: string; value: number | null; unit?: string}) {
    return createElement(Stat, {label, value, unit});
}

export function LineChart({series, unit}: {series: Array<{t: string; value: number | null}>; unit?: string}) {
    const points = series.filter((item) => item.value !== null);
    return createElement(
        "div",
        {className: "rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"},
        createElement("p", {className: "text-zinc-500"}, `${points.length} samples${unit ? ` (${unit})` : ""}`),
    );
}

export function PowerFlow({
    pv,
    battery,
    grid,
    house,
    soc,
}: {
    pv: number | null;
    battery: number | null;
    grid: number | null;
    house: number | null;
    soc?: number | null;
}) {
    const live = usePluginLive();
    return createElement(
        Card,
        null,
        createElement("h2", {className: "text-sm font-semibold"}, "Energy now"),
        createElement(
            "dl",
            {className: "mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"},
            flowItem("PV", pv, "W"),
            flowItem("Battery", battery, "W"),
            flowItem("Grid", grid, "W"),
            flowItem("House", house, "W"),
            soc === null || soc === undefined ? null : flowItem("SoC", soc, "%"),
        ),
        live.stale ? createElement("p", {className: "mt-3 text-xs text-amber-600"}, "Readings are stale") : null,
    );
}

function flowItem(label: string, value: number | null, unit: string) {
    return createElement(
        "div",
        {key: label},
        createElement("dt", {className: "text-zinc-500"}, label),
        createElement("dd", {className: "font-medium"}, value === null ? "—" : `${Math.round(value)} ${unit}`),
    );
}
