import {CLIMATE_METRIC_KEYS} from "@/lib/climate/types";
import {readLatestAiSummary, readScoreHistory} from "@/lib/ai-summary/store";
import type {AiSummaryPublic, AiSummaryRecord} from "@/lib/ai-summary/types";

export async function toPublicAiSummary(record: AiSummaryRecord): Promise<AiSummaryPublic> {
    const scoreHistory = await readScoreHistory(record.date);
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

export async function readAiSummaryPublic(): Promise<AiSummaryPublic | null> {
    const latest = await readLatestAiSummary();
    if (!latest) {
        return null;
    }
    return toPublicAiSummary(latest);
}

export function assertPublicSafe(body: AiSummaryPublic): void {
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
