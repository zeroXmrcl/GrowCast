"use client";

import {useEffect, useMemo, useRef, useState, type PointerEvent} from "react";
import {
    findStepSegment,
    layoutStepAxis,
    layoutStepRuns,
    morphStepFrame,
    pairStepPieces,
    stepRunFill,
    type StepAxisLabel,
    type StepMorphFrame,
    type StepMorphPiece,
    type StepSample,
    type StepSegment,
} from "@/lib/climate/plot";

const PLOT_W = 600;
const PLOT_H = 160;
const MORPH_MS = 640;
const PARTS = ["shared", "fadeOut", "fadeIn"] as const;

const TIME_LABEL = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

type Ghost = {
    pieces: StepMorphPiece[];
    labels: string[];
    axis: StepAxisLabel[];
};

type ClimateHistoryChartProps = {
    samples: StepSample[][];
    strokeClass: string;
    fillClass: string;
    format: (value: number | null) => string;
    draw: boolean;
    reduced: boolean;
};

function whenLabel(t: string): string {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? TIME_LABEL.format(ms) : t;
}

function scaleLabels(samples: StepSample[][], format: (value: number | null) => string): string[] {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const run of samples) {
        for (const sample of run) {
            if (sample.value < min) {
                min = sample.value;
            }
            if (sample.value > max) {
                max = sample.value;
            }
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return ["", "", ""];
    }
    return [format(max), format((min + max) / 2), format(min)];
}

function easeMorph(t: number): number {
    return 1 - (1 - t) ** 1.7;
}

function paintMorph(root: SVGGElement, frame: StepMorphFrame) {
    for (const part of PARTS) {
        const layer = frame[part];
        const fill = root.querySelector(`[data-part="${part}"][data-kind="fill"]`);
        const stroke = root.querySelector(`[data-part="${part}"][data-kind="stroke"]`);
        fill?.setAttribute("d", layer.fill);
        stroke?.setAttribute("d", layer.d);
        fill?.setAttribute("opacity", String(layer.opacity));
        stroke?.setAttribute("opacity", String(layer.opacity));
    }
}

function AxisMarks({axis}: {axis: StepAxisLabel[]}) {
    return axis.map((label, index) => (
        <span
            key={`${label.t}-${index}`}
            className={`absolute whitespace-nowrap tabular-nums ${index === axis.length - 1 ? "-translate-x-full" : index === 0 ? "" : "-translate-x-1/2"}`}
            style={{left: `${(label.x / PLOT_W) * 100}%`}}
        >
            {whenLabel(label.t)}
        </span>
    ));
}

export default function ClimateHistoryChart({
    samples,
    strokeClass,
    fillClass,
    format,
    draw,
    reduced,
}: ClimateHistoryChartProps) {
    const laid = useMemo(() => layoutStepRuns(samples, PLOT_W, PLOT_H), [samples]);
    const labels = useMemo(() => scaleLabels(samples, format), [samples, format]);
    const axis = useMemo(() => layoutStepAxis(samples, PLOT_W, PLOT_H), [samples]);
    const segments = useMemo(() => {
        const all: StepSegment[] = [];
        for (const run of laid) {
            for (const segment of run.segments) {
                all.push(segment);
            }
        }
        all.sort((a, b) => a.x0 - b.x0);
        return all;
    }, [laid]);
    const [snapshot, setSnapshot] = useState({samples, laid, labels, axis});
    const [ghost, setGhost] = useState<Ghost | null>(null);
    if (samples !== snapshot.samples) {
        const nextGhost = !reduced && snapshot.laid.length > 0 && laid.length > 0
            ? {
                pieces: pairStepPieces(snapshot.laid, laid, PLOT_W),
                labels: snapshot.labels,
                axis: snapshot.axis,
            }
            : null;
        setSnapshot({samples, laid, labels, axis});
        setGhost(nextGhost);
    }

    const frameOwner = useRef<Ghost | null>(null);
    const frameRef = useRef<StepMorphFrame | null>(null);
    if (frameOwner.current !== ghost) {
        frameOwner.current = ghost;
        frameRef.current = ghost ? morphStepFrame(ghost.pieces, 0, PLOT_H) : null;
    }
    const frame = frameRef.current;

    const morphRef = useRef<SVGGElement | null>(null);
    const strokesRef = useRef<SVGGElement | null>(null);
    const labelsRef = useRef<HTMLDivElement | null>(null);
    const ghostLabelsRef = useRef<HTMLDivElement | null>(null);
    const axisRef = useRef<HTMLDivElement | null>(null);
    const ghostAxisRef = useRef<HTMLDivElement | null>(null);
    const hairRef = useRef<HTMLSpanElement | null>(null);
    const tipRef = useRef<HTMLSpanElement | null>(null);
    const morphingRef = useRef(false);
    const settledMorph = useRef(false);
    morphingRef.current = ghost !== null;

    useEffect(() => {
        if (!ghost || !morphRef.current) {
            return;
        }
        const pieces = ghost.pieces;
        const root = morphRef.current;
        const labelsEl = labelsRef.current;
        const ghostLabelsEl = ghostLabelsRef.current;
        const axisEl = axisRef.current;
        const ghostAxisEl = ghostAxisRef.current;
        let raf = 0;
        let cancelled = false;
        const start = performance.now();
        function apply(t: number) {
            const next = morphStepFrame(pieces, easeMorph(t), PLOT_H);
            frameRef.current = next;
            paintMorph(root, next);
            const inn = t < 0.22 ? t / 0.22 : 1;
            const out = String(1 - inn);
            if (labelsEl) {
                labelsEl.style.opacity = String(inn);
            }
            if (ghostLabelsEl) {
                ghostLabelsEl.style.opacity = out;
            }
            if (axisEl) {
                axisEl.style.opacity = String(inn);
            }
            if (ghostAxisEl) {
                ghostAxisEl.style.opacity = out;
            }
        }
        apply(0);
        if (hairRef.current) {
            hairRef.current.style.opacity = "0";
        }
        if (tipRef.current) {
            tipRef.current.style.opacity = "0";
        }
        function tick(now: number) {
            if (cancelled) {
                return;
            }
            const t = Math.min(1, (now - start) / MORPH_MS);
            apply(t);
            if (t < 1) {
                raf = requestAnimationFrame(tick);
            } else {
                setGhost(null);
            }
        }
        raf = requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
        };
    }, [ghost]);

    useEffect(() => {
        if (ghost) {
            settledMorph.current = true;
            return;
        }
        if (!settledMorph.current) {
            return;
        }
        settledMorph.current = false;
        if (labelsRef.current) {
            labelsRef.current.style.opacity = "";
        }
        if (axisRef.current) {
            axisRef.current.style.opacity = "";
        }
        const root = strokesRef.current;
        if (!root) {
            return;
        }
        for (const path of root.querySelectorAll("path")) {
            path.style.strokeDasharray = "";
            path.style.strokeDashoffset = "";
            path.style.transition = "";
        }
    }, [ghost]);

    useEffect(() => {
        if (!draw || !strokesRef.current) {
            return;
        }
        const paths = [...strokesRef.current.querySelectorAll("path")];
        for (const path of paths) {
            const len = path.getTotalLength();
            path.style.strokeDasharray = String(len);
            path.style.strokeDashoffset = String(len);
            path.style.transition = "none";
        }
        const id = requestAnimationFrame(() => {
            for (const path of paths) {
                path.style.transition = "stroke-dashoffset 520ms var(--growcast-workspace-ease)";
                path.style.strokeDashoffset = "0";
            }
        });
        return () => cancelAnimationFrame(id);
    }, [draw]);

    function hideScrub() {
        if (hairRef.current) {
            hairRef.current.style.opacity = "0";
        }
        if (tipRef.current) {
            tipRef.current.style.opacity = "0";
        }
    }

    function onPointer(event: PointerEvent<HTMLDivElement>) {
        if (morphingRef.current) {
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || !hairRef.current || !tipRef.current) {
            return;
        }
        const ratio = (event.clientX - rect.left) / rect.width;
        const x = ratio < 0 ? 0 : ratio > 1 ? PLOT_W : ratio * PLOT_W;
        const segment = findStepSegment(segments, x);
        if (!segment) {
            hideScrub();
            return;
        }
        const xPx = event.clientX - rect.left;
        hairRef.current.style.left = `${xPx}px`;
        hairRef.current.style.opacity = "1";
        tipRef.current.textContent = `${whenLabel(segment.t)} · ${format(segment.value)}`;
        tipRef.current.style.opacity = "1";
        const width = tipRef.current.offsetWidth;
        const tx = Math.max(4, Math.min(rect.width - width - 4, xPx - width / 2));
        tipRef.current.style.transform = `translate(${tx}px, 0)`;
    }

    const labelClass = "flex h-40 w-12 shrink-0 flex-col justify-between pr-1 text-right text-[10px] leading-none text-zinc-400 tabular-nums";

    return (
        <div>
            <div className="relative flex">
                <div ref={labelsRef} className={labelClass} style={ghost ? {opacity: 0} : undefined}>
                    {labels.map((label, index) => (
                        <span key={index}>{label}</span>
                    ))}
                </div>
                {ghost ? (
                    <div ref={ghostLabelsRef} className={`pointer-events-none absolute top-0 left-0 ${labelClass}`}>
                        {ghost.labels.map((label, index) => (
                            <span key={index}>{label}</span>
                        ))}
                    </div>
                ) : null}
                <div
                    className="relative h-40 min-w-0 flex-1 touch-none"
                    onPointerDown={onPointer}
                    onPointerMove={onPointer}
                    onPointerLeave={hideScrub}
                >
                    <svg
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
                        preserveAspectRatio="none"
                    >
                        {[0, PLOT_H / 2, PLOT_H].map((y) => (
                            <line
                                key={y}
                                x1={0}
                                x2={PLOT_W}
                                y1={y}
                                y2={y}
                                className="stroke-zinc-200 dark:stroke-zinc-800"
                                strokeWidth={1}
                                vectorEffect="nonScalingStroke"
                            />
                        ))}
                        <g style={ghost ? {opacity: 0} : undefined}>
                            {laid.map((run, index) => (
                                <path
                                    key={`fill-${run.segments[0]?.t ?? index}-${index}`}
                                    d={stepRunFill(run, PLOT_H)}
                                    stroke="none"
                                    className={fillClass}
                                />
                            ))}
                            <g ref={strokesRef}>
                                {laid.map((run, index) => (
                                    <path
                                        key={`stroke-${run.segments[0]?.t ?? index}-${index}`}
                                        d={run.d}
                                        fill="none"
                                        strokeWidth={2}
                                        strokeLinejoin="miter"
                                        strokeLinecap="butt"
                                        vectorEffect="nonScalingStroke"
                                        className={strokeClass}
                                    />
                                ))}
                            </g>
                        </g>
                        {ghost && frame ? (
                            <g ref={morphRef}>
                                {PARTS.map((part) => (
                                    <g key={part}>
                                        <path
                                            data-part={part}
                                            data-kind="fill"
                                            d={frame[part].fill}
                                            stroke="none"
                                            opacity={frame[part].opacity}
                                            className={fillClass}
                                        />
                                        <path
                                            data-part={part}
                                            data-kind="stroke"
                                            d={frame[part].d}
                                            fill="none"
                                            strokeWidth={2}
                                            strokeLinejoin="miter"
                                            strokeLinecap="butt"
                                            vectorEffect="nonScalingStroke"
                                            opacity={frame[part].opacity}
                                            className={strokeClass}
                                        />
                                    </g>
                                ))}
                            </g>
                        ) : null}
                    </svg>
                    <span
                        ref={hairRef}
                        className="pointer-events-none absolute inset-y-0 w-px bg-zinc-900/40 opacity-0 dark:bg-zinc-100/40"
                        style={{
                            transition: reduced ? "none" : "opacity 120ms var(--growcast-workspace-ease)",
                            ...(ghost ? {opacity: 0} : {}),
                        }}
                    />
                    <span
                        ref={tipRef}
                        className="pointer-events-none absolute top-1 left-0 z-10 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white tabular-nums opacity-0 dark:bg-zinc-100 dark:text-zinc-900"
                        style={{
                            transition: reduced ? "none" : "opacity 120ms var(--growcast-workspace-ease)",
                            ...(ghost ? {opacity: 0} : {}),
                        }}
                    />
                </div>
            </div>
            <div className="relative mt-1 ml-12 h-[14px] text-[10px] leading-none text-zinc-400">
                <div ref={axisRef} className="absolute inset-0" style={ghost ? {opacity: 0} : undefined}>
                    <AxisMarks axis={axis}/>
                </div>
                {ghost ? (
                    <div ref={ghostAxisRef} className="pointer-events-none absolute inset-0">
                        <AxisMarks axis={ghost.axis}/>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
