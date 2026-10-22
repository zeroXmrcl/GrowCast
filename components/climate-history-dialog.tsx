"use client";

import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject} from "react";
import {createPortal} from "react-dom";
import ClimateHistoryChart from "@/components/climate-history-chart";
import type {ClimateHistoryPublic, ClimatePoint, ClimateWindow} from "@/lib/climate/history-public";
import type {ClimateHistoryMetric} from "@/lib/climate/history-ui";
import type {StepSample} from "@/lib/climate/plot";
import {formatHumidityPctTenths, formatTempC, formatVpd} from "@/lib/live-climate-view";

type HistoryKey = "24h" | "7d" | "30d" | "grow";
type Phase = "enter" | "open" | "leave";

type ClimateHistoryDialogProps = {
    history: ClimateHistoryPublic;
    metric: ClimateHistoryMetric;
    onMetricChange: (metric: ClimateHistoryMetric) => void;
    onClose: () => void;
};

const LEAVE_MS = 160;
const OPEN_EASE = "var(--growcast-workspace-ease)";
const CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";
const FOCUSABLE = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])";
const NAV = "absolute top-[54px] z-10 flex h-[52px] w-[18px] items-center justify-center rounded-sm text-zinc-500 transition-colors duration-[220ms] hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900/35 disabled:cursor-default disabled:opacity-[0.28] disabled:hover:text-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:outline-zinc-100/45 dark:disabled:hover:text-zinc-400";

const METRICS: {
    key: ClimateHistoryMetric;
    label: string;
    stroke: string;
    fill: string;
    format: (value: number | null) => string;
}[] = [
    {
        key: "tempC",
        label: "Temperature",
        stroke: "stroke-zinc-900 dark:stroke-zinc-100",
        fill: "fill-zinc-900/10 dark:fill-zinc-100/10",
        format: formatTempC,
    },
    {
        key: "humidityPct",
        label: "Humidity",
        stroke: "stroke-zinc-500",
        fill: "fill-zinc-500/10",
        format: formatHumidityPctTenths,
    },
    {
        key: "vpd",
        label: "VPD",
        stroke: "stroke-[#ea580c]",
        fill: "fill-[#ea580c]/10",
        format: formatVpd,
    },
];

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function samplesFor(
    runs: ClimatePoint[][],
    read: (point: ClimatePoint) => number,
): StepSample[][] {
    return runs.map((run) => run.map((point) => ({t: point.t, value: read(point)})));
}

function Chevron({direction}: {direction: "left" | "right"}) {
    const d = direction === "left" ? "M14.5 6.5 L9 12 l5.5 5.5" : "M9.5 6.5 L15 12 l-5.5 5.5";
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function selectedWindow(history: ClimateHistoryPublic, key: HistoryKey): ClimateWindow {
    if (key === "grow") {
        return history.grow ?? history["24h"];
    }
    return history[key];
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
        const panel = root;
        function list(): HTMLElement[] {
            return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.tabIndex !== -1);
        }
        panel.focus();
        function onKey(event: KeyboardEvent) {
            if (event.key !== "Tab") {
                return;
            }
            const items = list();
            if (items.length === 0) {
                event.preventDefault();
                panel.focus();
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
            if (!panel.contains(event.target as Node)) {
                const items = list();
                (items[0] ?? panel).focus();
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

export default function ClimateHistoryDialog({
    history,
    metric,
    onMetricChange,
    onClose,
}: ClimateHistoryDialogProps) {
    const titleId = useId();
    const [key, setKey] = useState<HistoryKey>("24h");
    const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? "open" : "enter"));
    const [reduced] = useState(() => prefersReducedMotion());
    const [openedMetric] = useState(metric);
    const [bar, setBar] = useState({x: 0, y: 0, width: 0});
    const onCloseRef = useRef(onClose);
    const closing = useRef(false);
    const timer = useRef<number | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const scaleRef = useRef<HTMLDivElement | null>(null);
    const mounted = typeof document !== "undefined";
    const metricIndex = Math.max(0, METRICS.findIndex((item) => item.key === metric));
    const activeMetric = METRICS[metricIndex];

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useScrollLock();
    useFocusTrap(panelRef, mounted);

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
    const slideRef = useRef<(direction: -1 | 1) => void>(() => {});
    useEffect(() => {
        requestCloseRef.current = requestClose;
        slideRef.current = (direction) => {
            const next = METRICS[metricIndex + direction];
            if (next) {
                onMetricChange(next.key);
            }
        };
    });

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                requestCloseRef.current();
                return;
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                slideRef.current(event.key === "ArrowLeft" ? -1 : 1);
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

    const chips = useMemo(() => {
        const list: {key: HistoryKey; label: string}[] = [
            {key: "24h", label: "24 hours"},
            {key: "7d", label: "7 days"},
            {key: "30d", label: "30 days"},
        ];
        if (history.grow !== null) {
            list.push({key: "grow", label: "This grow"});
        }
        return list;
    }, [history.grow]);
    const active: HistoryKey = key === "grow" && history.grow === null ? "24h" : key;
    const view = selectedWindow(history, active);
    const empty = view.runs.length === 0 || view.stats === null;
    const series = useMemo(() => {
        const window = selectedWindow(history, active);
        if (window.runs.length === 0 || window.stats === null) {
            return null;
        }
        return {
            tempC: samplesFor(window.runs, (point) => point.tempC),
            humidityPct: samplesFor(window.runs, (point) => point.humidityPct),
            vpd: samplesFor(window.runs, (point) => point.vpd),
        };
    }, [active, history]);

    useLayoutEffect(() => {
        const row = scaleRef.current;
        if (!row) {
            return;
        }
        function place() {
            const btn = row?.querySelector<HTMLButtonElement>(`[data-range="${active}"]`);
            if (!row || !btn) {
                return;
            }
            const rowBox = row.getBoundingClientRect();
            const buttonBox = btn.getBoundingClientRect();
            setBar({
                x: buttonBox.left - rowBox.left,
                y: buttonBox.bottom - rowBox.top - 2,
                width: buttonBox.width,
            });
        }
        place();
        const observer = new ResizeObserver(place);
        observer.observe(row);
        return () => observer.disconnect();
    }, [active, chips]);

    const shown = phase === "open";
    const dimStyle: CSSProperties = reduced
        ? {opacity: 1}
        : {
            opacity: shown ? 1 : 0,
            transition: shown ? `opacity 220ms ${OPEN_EASE}` : `opacity ${LEAVE_MS}ms ${CLOSE_EASE}`,
        };
    const panelMotionStyle: CSSProperties = reduced
        ? {opacity: 1, transform: "translateY(0px)"}
        : {
            opacity: shown ? 1 : 0,
            transform: `translateY(${shown ? "0px" : "8px"})`,
            transition: shown
                ? `transform 360ms ${OPEN_EASE}, opacity 360ms ${OPEN_EASE}`
                : `transform ${LEAVE_MS}ms ${CLOSE_EASE}, opacity ${LEAVE_MS}ms ${CLOSE_EASE}`,
        };
    const previous = metricIndex > 0 ? METRICS[metricIndex - 1] : null;
    const next = metricIndex < METRICS.length - 1 ? METRICS[metricIndex + 1] : null;

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
                    <div className="flex items-start justify-between gap-3">
                        <h2
                            key={metric}
                            id={titleId}
                            className={`text-lg font-semibold text-zinc-900 dark:text-zinc-100 ${reduced ? "" : "growcast-history-swap"}`}
                        >
                            {activeMetric.label}
                        </h2>
                        <button
                            type="button"
                            aria-label="Close"
                            onClick={requestClose}
                            className="-mt-1 h-8 w-8 shrink-0 rounded-full text-xl leading-none text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                        >
                            ×
                        </button>
                    </div>
                    <div
                        ref={scaleRef}
                        role="group"
                        aria-label="Time range"
                        className="relative mt-3 mb-2.5 flex flex-wrap gap-x-[22px] gap-y-1"
                    >
                        <span
                            className="absolute top-0 left-0 h-0.5 rounded-sm bg-zinc-900 dark:bg-zinc-100"
                            style={{
                                width: bar.width,
                                transform: `translate(${bar.x}px, ${bar.y}px)`,
                                transition: reduced ? "none" : `transform 220ms ${OPEN_EASE}, width 220ms ${OPEN_EASE}`,
                            }}
                        />
                        {chips.map((chip) => {
                            const pressed = chip.key === active;
                            return (
                                <button
                                    key={chip.key}
                                    type="button"
                                    data-range={chip.key}
                                    aria-pressed={pressed}
                                    onClick={() => setKey(chip.key)}
                                    className={`relative z-[1] pb-2 text-sm hover:text-zinc-900 dark:hover:text-zinc-100 ${pressed ? "font-semibold text-zinc-900 dark:text-zinc-100" : "font-medium text-zinc-500 dark:text-zinc-400"}`}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}
                    </div>
                    {empty || series === null ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-300">No climate history yet</p>
                    ) : (
                        <div className="relative">
                            <button
                                type="button"
                                className={`${NAV} -left-[14px]`}
                                aria-label={previous ? `Show ${previous.label}` : "Previous metric"}
                                disabled={!previous}
                                onClick={() => previous && onMetricChange(previous.key)}
                            >
                                <Chevron direction="left"/>
                            </button>
                            <div className="overflow-hidden">
                                <div
                                    className="flex w-full"
                                    style={{
                                        transform: `translateX(${-metricIndex * 100}%)`,
                                        transition: reduced ? "none" : `transform 360ms ${OPEN_EASE}`,
                                    }}
                                >
                                    {METRICS.map((item) => (
                                        <div
                                            key={item.key}
                                            aria-hidden={item.key !== metric}
                                            className={`w-full min-w-0 shrink-0 ${item.key === metric ? "" : "pointer-events-none"}`}
                                        >
                                            <ClimateHistoryChart
                                                samples={series[item.key]}
                                                strokeClass={item.stroke}
                                                fillClass={item.fill}
                                                format={item.format}
                                                draw={!reduced && item.key === openedMetric}
                                                reduced={reduced}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="button"
                                className={`${NAV} -right-[14px]`}
                                aria-label={next ? `Show ${next.label}` : "Next metric"}
                                disabled={!next}
                                onClick={() => next && onMetricChange(next.key)}
                            >
                                <Chevron direction="right"/>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return mounted ? createPortal(ui, document.body) : null;
}
