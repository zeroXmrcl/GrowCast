import {CLIMATE_METRIC_KEYS, type ClimateMetricKey} from "@/lib/climate/types";
import {parseMosaicRow} from "@/lib/ai-summary/mosaic";
import {AI_SUMMARY_MOSAIC_SLOTS, AI_SUMMARY_SCORE_DAYS, type AiSummaryPublic} from "@/lib/ai-summary/types";
import {WORKSPACE_AREA, WORKSPACE_PAD, WORKSPACE_TITLE, WORKSPACE_VT} from "@/lib/workspace";

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

const CELL_FILL = ["#d4d4d8", "#10b981", "#f59e0b", "#ef4444"] as const;

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

function formatRange(key: ClimateMetricKey, min: number, max: number): string {
    const digits = key === "vpd" ? 2 : key === "tempC" || key === "humidityPct" ? 1 : 0;
    return `${min.toFixed(digits)}–${max.toFixed(digits)} ${METRIC_UNITS[key]}`;
}

function MosaicSvg({summary}: {summary: AiSummaryPublic}) {
    const labelWidth = 28;
    const rowHeight = 6;
    const rowGap = 3;
    const cell = 2.2;
    const colGap = 0.55;
    const stride = cell + colGap;
    const width = labelWidth + AI_SUMMARY_MOSAIC_SLOTS * stride;
    const height = CLIMATE_METRIC_KEYS.length * (rowHeight + rowGap) - rowGap;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full"
            role="img"
            aria-label="Last 24 hours of climate, one dot per 5 minutes"
        >
            <title>24-hour climate mosaic</title>
            {CLIMATE_METRIC_KEYS.map((key, row) => {
                const y = row * (rowHeight + rowGap);
                const cells = parseMosaicRow(summary.mosaic[key] ?? "");
                return (
                    <g key={key}>
                        <text
                            x={0}
                            y={y + rowHeight - 0.6}
                            className="fill-zinc-500 dark:fill-zinc-400"
                            fontSize="5.5"
                            fontFamily="ui-sans-serif, system-ui, sans-serif"
                        >
                            {METRIC_LABELS[key]}
                        </text>
                        {cells.map((cellValue, index) => (
                            <rect
                                key={`${key}-${index}`}
                                x={labelWidth + index * stride}
                                y={y + 0.5}
                                width={cell}
                                height={rowHeight - 1}
                                rx={0.7}
                                className={cellValue === 0 ? "fill-zinc-200 dark:fill-zinc-700" : undefined}
                                fill={cellValue === 0 ? undefined : CELL_FILL[cellValue]}
                            >
                                <title>{`${METRIC_LABELS[key]} slot ${index + 1}`}</title>
                            </rect>
                        ))}
                    </g>
                );
            })}
        </svg>
    );
}

function ScoreMatrix({history}: {history: AiSummaryPublic["scoreHistory"]}) {
    const byDate = new Map(history.map((point) => [point.date, point.score]));
    const cells: Array<{date: string; score: number | null}> = [];
    const newest = history[history.length - 1]?.date;
    if (!newest) {
        return null;
    }
    const [year, month, day] = newest.split("-").map(Number);
    for (let i = AI_SUMMARY_SCORE_DAYS - 1; i >= 0; i -= 1) {
        const utc = new Date(Date.UTC(year, month - 1, day - i));
        const date = `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
        cells.push({date, score: byDate.get(date) ?? null});
    }
    const size = 10;
    const gap = 3;
    const width = AI_SUMMARY_SCORE_DAYS * (size + gap) - gap;
    return (
        <svg
            viewBox={`0 0 ${width} ${size}`}
            className="h-3 w-full max-w-md"
            role="img"
            aria-label="Score for the last 30 days"
        >
            <title>30-day score</title>
            {cells.map((cell, index) => (
                <rect
                    key={cell.date}
                    x={index * (size + gap)}
                    y={0}
                    width={size}
                    height={size}
                    rx={2}
                    className={cell.score === null ? "fill-zinc-200 dark:fill-zinc-800" : undefined}
                    fill={cell.score === null ? undefined : scoreFill(cell.score)}
                >
                    <title>
                        {cell.score === null ? `${cell.date}: no score` : `${cell.date}: ${cell.score}`}
                    </title>
                </rect>
            ))}
        </svg>
    );
}

function verdictLabel(verdict: string): string {
    switch (verdict) {
        case "in_range":
            return "in range";
        case "slightly_off":
            return "slightly off";
        case "off":
            return "off";
        default:
            return "unknown";
    }
}

export default function AiSummaryCard({summary}: {summary: AiSummaryPublic | null}) {
    return (
        <section className={`${WORKSPACE_AREA.ai} ${WORKSPACE_VT.ai} ${WORKSPACE_PAD}`}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <h2 className={`${WORKSPACE_TITLE} mb-0`}>AI Assessment</h2>
                {summary ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {summary.date}
                        {summary.stageLabel ? ` · ${summary.stageLabel}` : ""}
                        {summary.daysSinceSeeding !== null ? ` · Day ${summary.daysSinceSeeding}` : ""}
                    </p>
                ) : null}
            </div>

            {summary ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <p
                            className="text-4xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
                            style={{color: scoreFill(summary.score)}}
                        >
                            {summary.score}
                        </p>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {summary.rating}
                            </p>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">{summary.headline}</p>
                        </div>
                    </div>

                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {summary.summary}
                    </p>

                    {summary.plantObservation ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">Plant: </span>
                            {summary.plantObservation}
                        </p>
                    ) : null}

                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            24h mosaic · 5-minute slots
                        </p>
                        <MosaicSvg summary={summary} />
                        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
                            Green is in the AI range, yellow is close, red is outside, grey has no sample.
                        </p>
                    </div>

                    <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
                        {CLIMATE_METRIC_KEYS.map((key) => {
                            const range = summary.ranges[key];
                            const verdict = summary.verdicts[key];
                            return (
                                <div
                                    key={key}
                                    className="rounded-md border border-zinc-200 px-2 py-2 dark:border-zinc-800"
                                >
                                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">
                                        {METRIC_LABELS[key]}
                                    </dt>
                                    <dd className="mt-1 text-zinc-500 dark:text-zinc-400">
                                        {formatRange(key, range.min, range.max)}
                                        <br />
                                        {verdictLabel(verdict.verdict)}
                                        {verdict.pctInRange !== null
                                            ? ` · ${Math.round(verdict.pctInRange)}%`
                                            : ""}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>

                    {summary.recommendations.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                            {summary.recommendations.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    ) : null}

                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            30-day score
                        </p>
                        <ScoreMatrix history={summary.scoreHistory} />
                    </div>
                </div>
            ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No assessment yet. The daily job runs around 08:00 (Europe/Berlin) once an xAI key
                    is set.
                </p>
            )}
        </section>
    );
}
