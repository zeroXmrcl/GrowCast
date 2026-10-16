"use client";

import {memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type RefObject} from "react";
import {createPortal} from "react-dom";
import {
    findStepSegment,
    layoutStepAxis,
    layoutStepRuns,
    type StepRunPath,
    type StepSample,
    type StepSegment,
} from "@/lib/climate/plot";
import type {ClimateHistoryPublic, ClimateMetricStats, ClimatePoint, ClimateWindow} from "@/lib/climate/history-public";
import {
    CLIMATE_HISTORY_METRIC_CHIPS,
    type ClimateHistoryMetric,
} from "@/lib/climate/history-ui";
import {formatHumidityPctTenths, formatTempC, formatVpd} from "@/lib/live-climate-view";

type HistoryKey = "24h" | "7d" | "30d" | "grow";
type Phase = "enter" | "open" | "leave";

type ClimateHistoryDialogProps = {
    history: ClimateHistoryPublic;
    metric: ClimateHistoryMetric;
    onMetricChange: (metric: ClimateHistoryMetric) => void;
    onClose: () => void;
};

const PLOT_W = 600;
const PLOT_H = 160;
const LEAVE_MS = 160;
const OPEN_EASE = "var(--growcast-workspace-ease)";
const CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";
const FOCUSABLE = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])";

const CHIP_ON =
    "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900";
const CHIP_OFF =
    "rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300";

const TIME_LABEL = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

const METRICS: {
    key: ClimateHistoryMetric;
    label: string;
    stroke: string;
    format: (value: number | null) => string;
}[] = [
    {
        key: "tempC",
        label: "Temperature",
        stroke: "stroke-zinc-900 dark:stroke-zinc-100",
        format: formatTempC,
    },
    {
        key: "humidityPct",
        label: "Humidity",
        stroke: "stroke-zinc-500",
        format: formatHumidityPctTenths,
    },
    {
        key: "vpd",
        label: "VPD",
        stroke: "stroke-[#ea580c]",
        format: formatVpd,
    },
];

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rangeText(format: (value: number | null) => string, stats: ClimateMetricStats): string {
    return `${format(stats.min)} – ${format(stats.max)} · ${format(stats.avg)}`;
}

function samplesFor(
    runs: ClimatePoint[][],
    read: (point: ClimatePoint) => number,
): StepSample[][] {
    return runs.map((run) => run.map((point) => ({t: point.t, value: read(point)})));
}

function selectedWindow(history: ClimateHistoryPublic, key: HistoryKey): ClimateWindow {
    if (key === "grow") {
        return history.grow ?? history["24h"];
    }
    return history[key];
}

function whenLabel(t: string): string {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? TIME_LABEL.format(ms) : t;
}

function useScrollLock(): void {
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        const prevBodyPad = body.style.paddingRight;
        const gutter = window.innerWidth - html.clientWidth;
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        if (gutter > 0) {
            body.style.paddingRight = `${gutter}px`;
        }
        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
            body.style.paddingRight = prevBodyPad;
        };
    }, []);
}

function useFocusTrap(rootRef: RefObject<HTMLElement | null>, active: boolean): void {
    useEffect(() => {
        if (!active) {
            return;
        }
        const root = rootRef.current;
        if (!root) {
            return;
        }
        function list(): HTMLElement[] {
            if (!root) {
                return [];
            }
            return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.tabIndex !== -1);
        }
        root.focus();
        function onKey(event: KeyboardEvent) {
            if (event.key !== "Tab") {
                return;
            }
            const items = list();
            if (items.length === 0) {
                event.preventDefault();
                root.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        function onFocusIn(event: FocusEvent) {
            if (!root.contains(event.target as Node)) {
                const items = list();
                (items[0] ?? root).focus();
            }
        }
        document.addEventListener("keydown", onKey);
        document.addEventListener("focusin", onFocusIn);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("focusin", onFocusIn);
        };
    }, [active, rootRef]);
}

const PlotSvg = memo(function PlotSvg({
    laid,
    stroke,
}: {
    laid: StepRunPath[];
    stroke: string;
}) {
    return (
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
            {laid.map((run, index) => (
                <path
                    key={`${run.segments[0]?.t ?? index}-${index}`}
                    d={run.d}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="miter"
                    strokeLinecap="butt"
                    vectorEffect="nonScalingStroke"
                    className={stroke}
                />
            ))}
        </svg>
    );
});

function MetricPlot({
    label,
    last,
    detail,
    samples,
    stroke,
    format,
    hoverX,
}: {
    label: string;
    last: string;
    detail: string;
    samples: StepSample[][];
    stroke: string;
    format: (value: number | null) => string;
    hoverX: number | null;
}) {
    const laid = useMemo(() => layoutStepRuns(samples, PLOT_W, PLOT_H), [samples]);
    const segments = useMemo(() => {
        const all: StepSegment[] = [];
        for (const run of laid) {
            for (const segment of run.segments) {
                all.push(segment);
            }
        }
        return all;
    }, [laid]);
    const hover = hoverX === null ? null : findStepSegment(segments, hoverX);
    const tipLeft = hover === null
        ? 0
        : Math.min(92, Math.max(8, ((hover.x0 + hover.x1) / 2 / PLOT_W) * 100));
    const lineLeft = hover === null ? 0 : ((hover.x0 + hover.x1) / 2 / PLOT_W) * 100;

    return (
        <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{last}</p>
            <p className="mt-1 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{detail}</p>
            <div className="relative mt-2 h-40">
                <PlotSvg laid={laid} stroke={stroke}/>
                {hover ? (
                    <>
                        <span
                            className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-zinc-900/40 dark:bg-zinc-100/40"
                            style={{left: `${lineLeft}%`}}
                        />
                        <span
                            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs tabular-nums text-white dark:bg-zinc-100 dark:text-zinc-900"
                            style={{left: `${tipLeft}%`}}
                        >
                            {whenLabel(hover.t)} · {format(hover.value)}
                        </span>
                    </>
                ) : null}
            </div>
        </div>
    );
}

export default function ClimateHistoryDialog({
    history,
    metric,
    onMetricChange,
    onClose,
}: ClimateHistoryDialogProps) {
    const titleId = useId();
    const [key, setKey] = useState<HistoryKey>("24h");
    const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? "open" : "enter"));
    const [hoverX, setHoverX] = useState<number | null>(null);
    const [mount, setMount] = useState<HTMLElement | null>(null);
    const [swapAnim, setSwapAnim] = useState(false);
    const onCloseRef = useRef(onClose);
    const closing = useRef(false);
    const timer = useRef<number | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const firstSwap = useRef(true);
    onCloseRef.current = onClose;

    useEffect(() => {
        setMount(document.body);
    }, []);

    useScrollLock();
    useFocusTrap(panelRef, mount !== null);

    useEffect(() => {
        if (phase !== "enter") {
            return;
        }
        let second = 0;
        const first = window.requestAnimationFrame(() => {
            second = window.requestAnimationFrame(() => setPhase("open"));
        });
        return () => {
            window.cancelAnimationFrame(first);
            window.cancelAnimationFrame(second);
        };
    }, [phase]);

    function requestClose() {
        if (closing.current) {
            return;
        }
        closing.current = true;
        if (prefersReducedMotion() || phase !== "open") {
            onCloseRef.current();
            return;
        }
        setPhase("leave");
        timer.current = window.setTimeout(() => {
            onCloseRef.current();
        }, LEAVE_MS);
    }

    const requestCloseRef = useRef(requestClose);
    requestCloseRef.current = requestClose;

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                requestCloseRef.current();
            }
        }
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            if (timer.current !== null) {
                window.clearTimeout(timer.current);
            }
        };
    }, []);

    const chips: {key: HistoryKey; label: string}[] = [
        {key: "24h", label: "24h"},
        {key: "7d", label: "7 days"},
        {key: "30d", label: "30 days"},
    ];
    if (history.grow !== null) {
        chips.push({key: "grow", label: "This grow"});
    }
    const active: HistoryKey = key === "grow" && history.grow === null ? "24h" : key;
    const view = selectedWindow(history, active);
    const stats = view.stats;
    const empty = view.runs.length === 0 || stats === null;
    const activeMetric = METRICS.find((item) => item.key === metric) ?? METRICS[0];
    const series = useMemo(() => {
        if (view.runs.length === 0 || view.stats === null) {
            return null;
        }
        return {
            tempC: samplesFor(view.runs, (point) => point.tempC),
            humidityPct: samplesFor(view.runs, (point) => point.humidityPct),
            vpd: samplesFor(view.runs, (point) => point.vpd),
        };
    }, [view]);
    const axisLabels = useMemo(
        () => layoutStepAxis(
            view.runs.map((run) => run.map((point) => ({t: point.t, value: point.tempC}))),
            PLOT_W,
            PLOT_H,
        ),
        [view],
    );
    const swapKey = `${metric}:${active}`;

    useEffect(() => {
        if (firstSwap.current) {
            firstSwap.current = false;
            return;
        }
        setSwapAnim(!prefersReducedMotion());
    }, [swapKey]);

    function onHover(event: PointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) {
            return;
        }
        const ratio = (event.clientX - rect.left) / rect.width;
        const x = ratio < 0 ? 0 : ratio > 1 ? PLOT_W : ratio * PLOT_W;
        setHoverX(x);
    }

    const reduced = prefersReducedMotion();
    const shown = phase === "open";
    const dimStyle: CSSProperties = reduced
        ? {opacity: 1}
        : {
            opacity: shown ? 1 : 0,
            transition: shown ? `opacity 220ms ${OPEN_EASE}` : `opacity ${LEAVE_MS}ms ${CLOSE_EASE}`,
        };
    const panelMotionStyle: CSSProperties = reduced
        ? {opacity: 1, scale: "1"}
        : {
            opacity: shown ? 1 : 0,
            scale: shown ? "1" : "0.96",
            transformOrigin: "50% 50%",
            transition: shown
                ? `scale 360ms ${OPEN_EASE}, opacity 360ms ${OPEN_EASE}`
                : `scale ${LEAVE_MS}ms ${CLOSE_EASE}, opacity ${LEAVE_MS}ms ${CLOSE_EASE}`,
        };

    const ui = (
        <div className="fixed inset-0 z-50" data-climate-history-dialog="">
            <button
                type="button"
                aria-label="Close"
                tabIndex={-1}
                className="absolute inset-0 z-0 bg-zinc-950/40 dark:bg-black/60"
                style={dimStyle}
                onClick={requestClose}
            />
            <div className="pointer-events-none absolute inset-0 z-10" style={panelMotionStyle}>
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    tabIndex={-1}
                    data-climate-history-metric={metric}
                    className="pointer-events-auto absolute left-1/2 top-1/2 max-h-[min(100dvh-28px,calc(100%-28px))] w-[min(760px,calc(100vw-28px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
                >
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            Past climate
                        </h2>
                        <button type="button" onClick={requestClose} className={CHIP_OFF}>
                            Close
                        </button>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                        {CLIMATE_HISTORY_METRIC_CHIPS.map((chip) => {
                            const pressed = chip.key === metric;
                            return (
                                <button
                                    key={chip.key}
                                    type="button"
                                    aria-pressed={pressed}
                                    onClick={() => {
                                        onMetricChange(chip.key);
                                        setHoverX(null);
                                    }}
                                    className={pressed ? CHIP_ON : CHIP_OFF}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mb-4 flex flex-wrap gap-2">
                        {chips.map((chip) => {
                            const pressed = chip.key === active;
                            return (
                                <button
                                    key={chip.key}
                                    type="button"
                                    aria-pressed={pressed}
                                    onClick={() => {
                                        setKey(chip.key);
                                        setHoverX(null);
                                    }}
                                    className={pressed ? CHIP_ON : CHIP_OFF}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}
                    </div>
                    <div key={swapKey} className={swapAnim ? "growcast-history-swap" : undefined}>
                        {empty || series === null || stats === null ? (
                            <p className="text-sm text-zinc-600 dark:text-zinc-300">No climate history yet</p>
                        ) : (
                            <div onPointerDown={onHover} onPointerMove={onHover} onPointerLeave={() => setHoverX(null)}>
                                <MetricPlot
                                    label={activeMetric.label}
                                    last={activeMetric.format(stats[activeMetric.key].last)}
                                    detail={rangeText(activeMetric.format, stats[activeMetric.key])}
                                    samples={series[activeMetric.key]}
                                    stroke={activeMetric.stroke}
                                    format={activeMetric.format}
                                    hoverX={hoverX}
                                />
                                <div className="relative mt-1 h-[10px] text-[10px] leading-none text-zinc-400">
                                    {axisLabels.map((label, index) => (
                                        <span
                                            key={`${label.t}-${index}`}
                                            className={`absolute whitespace-nowrap ${index === 0 ? "" : "-translate-x-1/2"}`}
                                            style={{left: `${(label.x / PLOT_W) * 100}%`}}
                                        >
                                            {whenLabel(label.t)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return mount ? createPortal(ui, mount) : null;
}
