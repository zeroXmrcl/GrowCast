import {berlinDateOnly} from "@/lib/energy/berlin";
import {getCurrentGrow} from "@/lib/db";
import {hasXaiApiKey} from "@/lib/ai-summary/config";
import {requestGrowSummary} from "@/lib/ai-summary/client";
import {loadNewestSnapshotStill} from "@/lib/ai-summary/image";
import {logAiSummary} from "@/lib/ai-summary/log";
import {buildMosaic, emptyMosaic} from "@/lib/ai-summary/mosaic";
import {buildAiSummaryUserPrompt, promptContainsForbiddenTargets} from "@/lib/ai-summary/prompt";
import {stageContextFromGrow} from "@/lib/ai-summary/stage";
import {
    aggregateClimateWindow,
    compactWindowStats,
    loadClimatePointsForWindow,
} from "@/lib/ai-summary/stats";
import {
    readAiSummaryDay,
    withAiSummaryLock,
    writeAiSummaryRecord,
} from "@/lib/ai-summary/store";
import type {AiSummaryRecord, GenerateResult} from "@/lib/ai-summary/types";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type GenerateOptions = {
    nowMs?: number;
    force?: boolean;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
};

export async function generateDailyAiSummary(options: GenerateOptions = {}): Promise<GenerateResult> {
    return withAiSummaryLock(() => generateDailyAiSummaryUnlocked(options));
}

async function generateDailyAiSummaryUnlocked(options: GenerateOptions): Promise<GenerateResult> {
    const nowMs = options.nowMs ?? Date.now();
    const env = options.env ?? process.env;
    const date = berlinDateOnly(nowMs);
    if (!hasXaiApiKey(env)) {
        return {ok: false, reason: "no_key"};
    }
    if (!options.force) {
        const existing = await readAiSummaryDay(date);
        if (existing) {
            return {ok: true, record: existing, reused: true};
        }
    }

    const grow = await getCurrentGrow();
    const stage = stageContextFromGrow(grow);
    const windowEndMs = nowMs;
    const windowStartMs = nowMs - WINDOW_MS;
    const points = await loadClimatePointsForWindow(windowStartMs, windowEndMs);
    const stats = compactWindowStats(aggregateClimateWindow(points, windowStartMs, windowEndMs));
    const still = await loadNewestSnapshotStill();
    const userText = buildAiSummaryUserPrompt({
        stage,
        stats,
        imageUsed: still !== null,
    });
    if (promptContainsForbiddenTargets(userText)) {
        logAiSummary("prompt_leaked_targets");
        return {ok: false, reason: "invalid_response"};
    }

    const ai = await requestGrowSummary({
        userText,
        still,
        fetchImpl: options.fetchImpl,
        env,
    });
    if (!ai) {
        return {ok: false, reason: "request_failed"};
    }

    const record: AiSummaryRecord = {
        date,
        generatedAt: new Date(nowMs).toISOString(),
        growId: grow.id,
        stage,
        stats,
        ai,
        mosaic: still || points.length > 0 ? buildMosaic(points, windowStartMs, ai.ranges) : emptyMosaic(),
        imageUsed: still !== null,
    };
    await writeAiSummaryRecord(record);
    logAiSummary("generated", {date, score: ai.score, imageUsed: record.imageUsed}, "info");
    return {ok: true, record, reused: false};
}
