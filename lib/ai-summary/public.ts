import {berlinDateOnly, shiftDateOnly} from "@/lib/energy/berlin";
import {CLIMATE_METRIC_KEYS} from "@/lib/climate/types";
import {aiSummaryDemoMode} from "@/lib/ai-summary/config";
import {buildMockAiSummaryRecord} from "@/lib/ai-summary/mock";
import {readLatestAiSummary, readScoreHistory} from "@/lib/ai-summary/store";
import type {AiSummaryPublic, AiSummaryRecord, AiSummaryScorePoint} from "@/lib/ai-summary/types";

const DEMO_SCORE_DAYS = 7;

export type AiSummaryPublicRead = {
    summary: AiSummaryPublic | null;
    demo: boolean;
};

function publicFromRecord(record: AiSummaryRecord, scoreHistory: AiSummaryScorePoint[]): AiSummaryPublic {
    return {
        date: record.date,
        generatedAt: record.generatedAt,
        score: record.ai.score,
        rating: record.ai.rating,
        headline: record.ai.headline,
        summary: record.ai.summary,
        plantObservation: record.ai.plantObservation,
        recommendations: record.ai.recommendations.slice(0, 3),
        confidence: record.ai.confidence,
        ranges: record.ai.ranges,
        verdicts: record.ai.verdicts,
        mosaic: record.mosaic,
        scoreHistory,
        daysSinceSeeding: record.stage.daysSinceSeeding,
        stageLabel: record.stage.stageLabel,
        phase: record.stage.phase,
        lightHours: record.stats.lightHours,
    };
}

function demoScoreHistory(endDate: string, score: number): AiSummaryScorePoint[] {
    const points: AiSummaryScorePoint[] = [];
    for (let ago = DEMO_SCORE_DAYS - 1; ago >= 0; ago -= 1) {
        points.push({
            date: shiftDateOnly(endDate, -ago),
            score: Math.max(0, score - (ago % 3) * 3),
        });
    }
    return points;
}

function demoPublicAiSummary(nowMs: number = Date.now()): AiSummaryPublic {
    const date = berlinDateOnly(nowMs);
    const record = buildMockAiSummaryRecord({date});
    return publicFromRecord(record, demoScoreHistory(date, record.ai.score));
}

export async function toPublicAiSummary(record: AiSummaryRecord): Promise<AiSummaryPublic> {
    return publicFromRecord(record, await readScoreHistory(record.date));
}

export async function readStoredAiSummaryPublic(): Promise<AiSummaryPublic | null> {
    const latest = await readLatestAiSummary();
    if (!latest) {
        return null;
    }
    return toPublicAiSummary(latest);
}

export async function readAiSummaryPublic(
    env: NodeJS.ProcessEnv = process.env,
): Promise<AiSummaryPublicRead> {
    const stored = await readStoredAiSummaryPublic();
    if (stored) {
        return {summary: stored, demo: false};
    }
    if (!aiSummaryDemoMode(env)) {
        return {summary: null, demo: false};
    }
    return {summary: demoPublicAiSummary(), demo: true};
}

export const AI_SUMMARY_PUBLIC_KEYS = [
    "date",
    "generatedAt",
    "score",
    "rating",
    "headline",
    "summary",
    "plantObservation",
    "recommendations",
    "confidence",
    "ranges",
    "verdicts",
    "mosaic",
    "scoreHistory",
    "daysSinceSeeding",
    "stageLabel",
    "phase",
    "lightHours",
] as const;

const PUBLIC_KEY_SET = new Set<string>(AI_SUMMARY_PUBLIC_KEYS);

export function assertPublicSafe(body: AiSummaryPublic): void {
    for (const key of Object.keys(body)) {
        if (!PUBLIC_KEY_SET.has(key)) {
            throw new Error("public_ai_summary_unsafe");
        }
    }
    const text = JSON.stringify(body);
    if (
        /XAI_API_KEY|data:image|serial|prompt|temperatureDay|humidityDay|growId/.test(text)
    ) {
        throw new Error("public_ai_summary_unsafe");
    }
    for (const key of CLIMATE_METRIC_KEYS) {
        if (typeof body.mosaic[key] !== "string") {
            throw new Error("public_ai_summary_mosaic");
        }
    }
}
