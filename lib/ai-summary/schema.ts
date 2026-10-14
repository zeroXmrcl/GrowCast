import {CLIMATE_METRIC_KEYS, type ClimateMetricKey} from "@/lib/climate/types";
import {isRecord} from "@/lib/coerce";
import type {
    AiMetricJudgment,
    AiSummaryPayload,
    ClimateWindowStats,
    DerivedRange,
    MetricVerdict,
} from "@/lib/ai-summary/types";

const VERDICTS = new Set<MetricVerdict>(["in_range", "slightly_off", "off", "unknown"]);

const METRIC_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["min", "max"],
    properties: {
        min: {type: "number"},
        max: {type: "number"},
    },
} as const;

const VERDICT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "pctInRange", "note"],
    properties: {
        verdict: {type: "string", enum: ["in_range", "slightly_off", "off", "unknown"]},
        pctInRange: {type: ["number", "null"]},
        note: {type: "string"},
    },
} as const;

export const GROW_SUMMARY_JSON_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [
        "score",
        "rating",
        "headline",
        "summary",
        "ranges",
        "verdicts",
        "plantObservation",
        "recommendations",
        "confidence",
    ],
    properties: {
        score: {type: "integer", minimum: 0, maximum: 100},
        rating: {type: "string"},
        headline: {type: "string"},
        summary: {type: "string"},
        ranges: {
            type: "object",
            additionalProperties: false,
            required: CLIMATE_METRIC_KEYS,
            properties: {
                tempC: METRIC_SCHEMA,
                humidityPct: METRIC_SCHEMA,
                vpd: METRIC_SCHEMA,
                co2: METRIC_SCHEMA,
                ppfd: METRIC_SCHEMA,
            },
        },
        verdicts: {
            type: "object",
            additionalProperties: false,
            required: CLIMATE_METRIC_KEYS,
            properties: {
                tempC: VERDICT_SCHEMA,
                humidityPct: VERDICT_SCHEMA,
                vpd: VERDICT_SCHEMA,
                co2: VERDICT_SCHEMA,
                ppfd: VERDICT_SCHEMA,
            },
        },
        plantObservation: {type: "string"},
        recommendations: {
            type: "array",
            items: {type: "string"},
            maxItems: 3,
        },
        confidence: {type: "integer", minimum: 0, maximum: 100},
    },
} as const;

function clipText(value: unknown, max: number): string {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim().slice(0, max);
}

function asFinite(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
}

const RANGE_LIMITS: Record<ClimateMetricKey, {lo: number; hi: number; maxWidth: number}> = {
    tempC: {lo: 0, hi: 45, maxWidth: 25},
    humidityPct: {lo: 0, hi: 100, maxWidth: 80},
    vpd: {lo: 0, hi: 5, maxWidth: 3},
    co2: {lo: 200, hi: 3000, maxWidth: 2500},
    ppfd: {lo: 0, hi: 2500, maxWidth: 2000},
};

type RangeDecision =
    | {kind: "range"; range: DerivedRange}
    | {kind: "absent"}
    | {kind: "illegal"};

function decideRange(key: ClimateMetricKey, raw: unknown): RangeDecision {
    if (raw === null || raw === undefined) {
        return {kind: "absent"};
    }
    if (!isRecord(raw)) {
        return {kind: "illegal"};
    }
    if (raw.min === null && raw.max === null) {
        return {kind: "absent"};
    }
    const min = asFinite(raw.min);
    const max = asFinite(raw.max);
    const limit = RANGE_LIMITS[key];
    if (min === null || max === null || max <= min) {
        return {kind: "illegal"};
    }
    if (min < limit.lo || max > limit.hi || max - min > limit.maxWidth) {
        return {kind: "illegal"};
    }
    return {kind: "range", range: {min, max}};
}

function parseVerdict(raw: unknown): AiMetricJudgment | null {
    if (!isRecord(raw)) {
        return null;
    }
    const verdict = typeof raw.verdict === "string" ? raw.verdict : "";
    if (!VERDICTS.has(verdict as MetricVerdict)) {
        return null;
    }
    let pctInRange = asFinite(raw.pctInRange);
    if (pctInRange === null && raw.pctInRange !== null && raw.pctInRange !== undefined) {
        return null;
    }
    if (pctInRange !== null) {
        pctInRange = Math.min(100, Math.max(0, pctInRange));
    }
    return {
        verdict: verdict as MetricVerdict,
        pctInRange,
        note: clipText(raw.note, 240),
    };
}

function parseSummary(
    raw: unknown,
    tolerateIllegal: boolean,
): {ai: AiSummaryPayload; illegal: ClimateMetricKey[]} | null {
    if (!isRecord(raw)) {
        return null;
    }
    const score = asFinite(raw.score);
    const confidence = asFinite(raw.confidence);
    if (score === null || confidence === null) {
        return null;
    }
    const rating = clipText(raw.rating, 40);
    const headline = clipText(raw.headline, 160);
    const summary = clipText(raw.summary, 2000);
    const plantObservation = clipText(raw.plantObservation, 500);
    if (!rating || !headline || !summary) {
        return null;
    }
    if (!isRecord(raw.ranges) || !isRecord(raw.verdicts)) {
        return null;
    }
    const ranges = {} as Record<ClimateMetricKey, DerivedRange | null>;
    const verdicts = {} as Record<ClimateMetricKey, AiMetricJudgment>;
    const illegal: ClimateMetricKey[] = [];
    for (const key of CLIMATE_METRIC_KEYS) {
        const decision = decideRange(key, raw.ranges[key]);
        const verdict = parseVerdict(raw.verdicts[key]);
        if (!verdict) {
            return null;
        }
        if (decision.kind === "illegal") {
            if (!tolerateIllegal) {
                return null;
            }
            illegal.push(key);
            ranges[key] = null;
        } else {
            ranges[key] = decision.kind === "range" ? decision.range : null;
        }
        verdicts[key] = verdict;
    }
    const recommendations: string[] = [];
    if (Array.isArray(raw.recommendations)) {
        for (const item of raw.recommendations) {
            const text = clipText(item, 240);
            if (text) {
                recommendations.push(text);
            }
            if (recommendations.length >= 3) {
                break;
            }
        }
    }
    return {
        illegal,
        ai: {
            score: Math.round(Math.min(100, Math.max(0, score))),
            rating,
            headline,
            summary,
            ranges,
            verdicts,
            plantObservation,
            recommendations,
            confidence: Math.round(Math.min(100, Math.max(0, confidence))),
        },
    };
}

export function parseAiSummaryPayload(raw: unknown): AiSummaryPayload | null {
    const parsed = parseSummary(raw, false);
    return parsed ? parsed.ai : null;
}

export function parseModelSummary(raw: unknown): {ai: AiSummaryPayload; illegal: ClimateMetricKey[]} | null {
    return parseSummary(raw, true);
}

/** Unmeasured metrics keep a null range. A measured metric still needs a legal band. */
export function applyUnmeasuredRanges(
    ai: AiSummaryPayload,
    illegal: ClimateMetricKey[],
    stats: ClimateWindowStats,
): AiSummaryPayload | null {
    const illegalKeys = new Set(illegal);
    const ranges = {...ai.ranges};
    for (const key of CLIMATE_METRIC_KEYS) {
        const count = stats.metrics[key]?.all.count ?? 0;
        if (count === 0) {
            ranges[key] = null;
            continue;
        }
        if (illegalKeys.has(key) || ranges[key] === null) {
            return null;
        }
    }
    return {...ai, ranges};
}

export function extractJsonObject(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) {
        return null;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        if (start === -1 || end <= start) {
            return null;
        }
        try {
            return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}
