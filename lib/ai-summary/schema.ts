import {CLIMATE_METRIC_KEYS, type ClimateMetricKey} from "@/lib/climate/types";
import {isRecord} from "@/lib/coerce";
import type {AiMetricJudgment, AiSummaryPayload, DerivedRange, MetricVerdict} from "@/lib/ai-summary/types";

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

function parseRange(raw: unknown): DerivedRange | null {
    if (!isRecord(raw)) {
        return null;
    }
    const min = asFinite(raw.min);
    const max = asFinite(raw.max);
    if (min === null || max === null || max < min) {
        return null;
    }
    return {min, max};
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

export function parseAiSummaryPayload(raw: unknown): AiSummaryPayload | null {
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
    const ranges = {} as Record<ClimateMetricKey, DerivedRange>;
    const verdicts = {} as Record<ClimateMetricKey, AiMetricJudgment>;
    for (const key of CLIMATE_METRIC_KEYS) {
        const range = parseRange(raw.ranges[key]);
        const verdict = parseVerdict(raw.verdicts[key]);
        if (!range || !verdict) {
            return null;
        }
        ranges[key] = range;
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
        score: Math.round(Math.min(100, Math.max(0, score))),
        rating,
        headline,
        summary,
        ranges,
        verdicts,
        plantObservation,
        recommendations,
        confidence: Math.round(Math.min(100, Math.max(0, confidence))),
    };
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
