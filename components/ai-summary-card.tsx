"use client";

import {useRef} from "react";
import {CLIMATE_METRIC_KEYS, type ClimateMetricKey} from "@/lib/climate/types";
import {foldMosaicRow, mosaicDetail, parseMosaicRow} from "@/lib/ai-summary/mosaic";
import {AI_SUMMARY_SCORE_DAYS, type AiSummaryPublic, type MosaicCell} from "@/lib/ai-summary/types";
import {APP_TIMEZONE} from "@/lib/app-timezone";
import {WORKSPACE_AREA, WORKSPACE_HAIRLINE, WORKSPACE_PAD, WORKSPACE_VT} from "@/lib/workspace";
import {formatDateDisplay} from "@/app/(site)/grows/format";

const METRIC_LABELS: Record<ClimateMetricKey, string> = {
    tempC: "Temp",
    humidityPct: "RH",
    vpd: "VPD",
    co2: "CO₂",
    ppfd: "PPFD",
};

const METRIC_UNITS: Record<ClimateMetricKey, string> = {
    tempC: "°C",
    humidityPct: "%",
    vpd: "kPa",
    co2: "ppm",
    ppfd: "µmol",
};

const WINDOW_MS = 24 * 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;

const BERLIN_CLOCK = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function scoreFill(score: number): string {
    if (score >= 80) {
        return "#10b981";
    }
    if (score >= 60) {
        return "#84cc16";
    }
    if (score >= 40) {
        return "#f59e0b";
    }
    return "#ef4444";
}

function cellFill(cell: MosaicCell): string | null {
    if (cell === 1) {
        return "#10b981";
    }
    if (cell === 2 || cell === 4 || cell === 5) {
        return "#f59e0b";
    }
    if (cell === 3 || cell === 6 || cell === 7) {
        return "#ef4444";
    }
    return null;
}

function formatRange(key: ClimateMetricKey, min: number, max: number): string {
    const digits = key === "vpd" ? 2 : key === "tempC" || key === "humidityPct" ? 1 : 0;
    return `${min.toFixed(digits)}–${max.toFixed(digits)} ${METRIC_UNITS[key]}`;
}

function percentClass(verdict: string): string {
    switch (verdict) {
        case "in_range":
            return "text-[#10b981]";
        case "slightly_off":
            return "text-[#f59e0b]";
        case "off":
            return "text-[#ef4444]";
        default:
            return "text-zinc-500 dark:text-zinc-400";
    }
}

function detailLabel(time: string, word: string): string {
    return word ? `${time} ${word}`.trim() : time;
}

function scoreWindow(history: AiSummaryPublic["scoreHistory"]): Array<{date: string; score: number | null}> {
    const newest = history[history.length - 1]?.date;
    if (!newest) {
        return [];
    }
    const byDate = new Map(history.map((point) => [point.date, point.score]));
    const [year, month, day] = newest.split("-").map(Number);
    const cells: Array<{date: string; score: number | null}> = [];
    for (let i = AI_SUMMARY_SCORE_DAYS - 1; i >= 0; i -= 1) {
        const utc = new Date(Date.UTC(year, month - 1, day - i));
        const date = `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
        cells.push({date, score: byDate.get(date) ?? null});
    }
    return cells;
}

function clearMotion(event: React.AnimationEvent<HTMLElement>) {
    event.currentTarget.style.animation = "none";
}

export default function AiSummaryCard({
    summary,
    demo = false,
}: {
    summary: AiSummaryPublic | null;
    demo?: boolean;
}) {
    const tipRef = useRef<HTMLDivElement>(null);
    const whenRef = useRef<HTMLSpanElement>(null);
    const markRef = useRef<HTMLSpanElement>(null);
    const activeRef = useRef<HTMLElement | null>(null);
    const stripRef = useRef<HTMLElement | null>(null);
    const shownRef = useRef(false);

    function hideTip() {
        shownRef.current = false;
        activeRef.current = null;
        stripRef.current = null;
        tipRef.current?.classList.remove("is-on");
    }

    function onPointerMove(event: React.PointerEvent<HTMLElement>) {
        const strip = (event.target as HTMLElement).closest<HTMLElement>("[data-strip]");
        const tip = tipRef.current;
        const when = whenRef.current;
        const mark = markRef.current;
        if (!strip || !tip || !when || !mark || !event.currentTarget.contains(strip)) {
            hideTip();
            return;
        }
        const count = Number(strip.dataset.count);
        const rect = strip.getBoundingClientRect();
        if (!Number.isFinite(count) || count < 1 || rect.width <= 0) {
            return;
        }
        const index = Math.min(count - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * count)));
        const cell = strip.children.item(index) as HTMLElement | null;
        if (!cell || cell === activeRef.current) {
            return;
        }
        const glide = shownRef.current && stripRef.current === strip;
        activeRef.current = cell;
        stripRef.current = strip;
        const box = cell.getBoundingClientRect();
        if (!glide) {
            tip.style.transition = "none";
        }
        tip.style.transform = `translate(${box.left + box.width / 2}px, ${box.top - 6}px) translate(-50%, -100%)`;
        if (!glide) {
            requestAnimationFrame(() => {
                tip.style.transition = "";
            });
        }
        when.textContent = cell.dataset.time ?? "";
        mark.textContent = cell.dataset.word ?? "";
        if (cell.dataset.tone === "score" && cell.dataset.score) {
            mark.style.color = scoreFill(Number(cell.dataset.score));
        } else if (cell.dataset.tone === "ok") {
            mark.style.color = "#10b981";
        } else if (cell.dataset.tone === "near") {
            mark.style.color = "#f59e0b";
        } else if (cell.dataset.tone === "far") {
            mark.style.color = "#ef4444";
        } else {
            mark.style.color = "";
        }
        tip.classList.add("is-on");
        shownRef.current = true;
    }

    const windowStart = summary ? Date.parse(summary.generatedAt) - WINDOW_MS : Number.NaN;
    const scores = summary ? scoreWindow(summary.scoreHistory) : [];
    const meta = summary
        ? [
            formatDateDisplay(summary.date),
            summary.stageLabel || null,
            summary.daysSinceSeeding !== null ? `Day ${summary.daysSinceSeeding}` : null,
            `confidence ${summary.confidence}`,
        ].filter((part) => part).join(" · ")
        : "";

    return (
        <section
            className={`${WORKSPACE_AREA.ai} ${WORKSPACE_VT.ai}`}
            onPointerMove={summary ? onPointerMove : undefined}
            onPointerLeave={summary ? hideTip : undefined}
        >
            {summary ? (
                <>
                    <div className="grid lg:grid-cols-2">
                        <div className={WORKSPACE_PAD}>
                            <div className="flex items-center gap-3.5">
                                <div className="relative h-[76px] w-[76px] shrink-0">
                                    <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
                                        <circle
                                            cx="40"
                                            cy="40"
                                            r="32"
                                            pathLength="100"
                                            className={`fill-none stroke-zinc-200 dark:stroke-zinc-800`}
                                            strokeWidth="6"
                                        />
                                        <circle
                                            cx="40"
                                            cy="40"
                                            r="32"
                                            pathLength="100"
                                            className="growcast-ai-arc fill-none"
                                            stroke={scoreFill(summary.score)}
                                            strokeWidth="6"
                                            style={{"--growcast-score": summary.score} as React.CSSProperties}
                                        />
                                    </svg>
                                    <b
                                        className="absolute inset-0 grid place-items-center text-2xl font-semibold tabular-nums tracking-tight"
                                        style={{color: scoreFill(summary.score)}}
                                    >
                                        {summary.score}
                                    </b>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <strong className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                            {summary.rating}
                                        </strong>
                                        {demo ? (
                                            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                                Demo
                                            </p>
                                        ) : null}
                                    </div>
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{summary.headline}</p>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{meta}</p>
                                </div>
                            </div>
                            <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                                {summary.summary}
                            </p>
                            {summary.plantObservation ? (
                                <p className="mt-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Plant. </span>
                                    {summary.plantObservation}
                                </p>
                            ) : null}
                            {summary.recommendations.length > 0 ? (
                                <ul className="mt-4 grid gap-1">
                                    {summary.recommendations.map((item) => (
                                        <li key={item} className="text-sm text-zinc-700 dark:text-zinc-300">
                                            – {item}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                        <div className={`${WORKSPACE_PAD} flex flex-col max-lg:border-t lg:border-l ${WORKSPACE_HAIRLINE}`}>
                            <div className="growcast-ai-mosaic flex h-full flex-1 flex-col justify-between gap-2.5">
                                {CLIMATE_METRIC_KEYS.map((key, row) => {
                                    const range = summary.ranges[key];
                                    const verdict = summary.verdicts[key];
                                    const cells = foldMosaicRow(parseMosaicRow(summary.mosaic[key] ?? ""));
                                    const percent = verdict.pctInRange === null ? null : Math.round(verdict.pctInRange);
                                    return (
                                        <div
                                            key={key}
                                            className="growcast-ai-row min-w-0"
                                            style={{"--growcast-i": row} as React.CSSProperties}
                                            onAnimationEnd={clearMotion}
                                        >
                                            <div className="mb-1 flex items-baseline justify-between gap-3">
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                                    {METRIC_LABELS[key]}
                                                </span>
                                                <span className="text-right text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                                                    {formatRange(key, range.min, range.max)}
                                                    {percent !== null ? (
                                                        <>
                                                            {" · "}
                                                            <span className={percentClass(verdict.verdict)}>{percent}%</span>
                                                        </>
                                                    ) : null}
                                                </span>
                                            </div>
                                            <div
                                                className="grid h-2.5 grid-cols-[repeat(48,minmax(0,1fr))] gap-[2px]"
                                                data-strip="mosaic"
                                                data-count={cells.length}
                                            >
                                                {cells.map((value, index) => {
                                                    const detail = mosaicDetail(value);
                                                    const time = Number.isFinite(windowStart)
                                                        ? BERLIN_CLOCK.format(windowStart + index * HALF_HOUR_MS)
                                                        : "";
                                                    const word = detail?.word ?? "";
                                                    const fill = cellFill(value);
                                                    return (
                                                        <div
                                                            key={`${key}-${index}`}
                                                            className={fill ? "h-full min-w-0" : "h-full min-w-0 bg-zinc-200 dark:bg-zinc-700"}
                                                            style={fill ? {backgroundColor: fill} : undefined}
                                                            data-time={time}
                                                            data-word={word}
                                                            data-tone={detail?.tone ?? ""}
                                                            title={detailLabel(time, word)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    {scores.length > 0 ? (
                        <div className={`${WORKSPACE_PAD} border-t ${WORKSPACE_HAIRLINE}`}>
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
                                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                    {formatDateDisplay(scores[0].date)}
                                </span>
                                <div
                                    className="grid h-3 grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]"
                                    data-strip="scores"
                                    data-count={scores.length}
                                >
                                    {scores.map((cell, index) => {
                                        const label = formatDateDisplay(cell.date);
                                        const word = cell.score === null ? "" : String(cell.score);
                                        return (
                                            <div
                                                key={cell.date}
                                                className={
                                                    cell.score === null
                                                        ? "growcast-ai-tick h-full rounded-[2px] bg-zinc-200 dark:bg-zinc-800"
                                                        : "growcast-ai-tick h-full rounded-[2px]"
                                                }
                                                style={
                                                    ({
                                                        "--growcast-i": index,
                                                        ...(cell.score === null ? {} : {backgroundColor: scoreFill(cell.score)}),
                                                    }) as React.CSSProperties
                                                }
                                                data-time={label}
                                                data-word={word}
                                                data-tone={cell.score === null ? "" : "score"}
                                                data-score={word}
                                                title={detailLabel(label, word)}
                                                onAnimationEnd={clearMotion}
                                            />
                                        );
                                    })}
                                </div>
                                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                    {formatDateDisplay(scores[scores.length - 1].date)}
                                </span>
                            </div>
                        </div>
                    ) : null}
                </>
            ) : (
                <div className={WORKSPACE_PAD}>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No assessment yet. The daily job runs around 08:00 (Europe/Berlin).
                    </p>
                </div>
            )}
            <div ref={tipRef} className="growcast-ai-tip" aria-hidden="true">
                <span ref={whenRef} />
                <span ref={markRef} className="font-semibold" />
            </div>
        </section>
    );
}
