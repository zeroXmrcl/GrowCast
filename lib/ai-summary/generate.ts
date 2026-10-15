import {berlinDateOnly} from "@/lib/energy/berlin";
import {getCurrentGrow} from "@/lib/db";
import {xaiApiKey} from "@/lib/ai-summary/config";
import {requestGrowSummary} from "@/lib/ai-summary/client";
import {loadNewestSnapshotStill} from "@/lib/ai-summary/image";
import {logAiSummary} from "@/lib/ai-summary/log";
import {buildMosaic, emptyMosaic, verdictsFromMosaic} from "@/lib/ai-summary/mosaic";
import {buildAiSummaryUserPrompt, promptContainsForbiddenTargets} from "@/lib/ai-summary/prompt";
import {applyUnmeasuredRanges} from "@/lib/ai-summary/schema";
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
import {releaseAiApiCall, reserveAiApiCall} from "@/lib/ai-summary/usage";
import type {AiSummaryRecord, GenerateReason, GenerateResult} from "@/lib/ai-summary/types";

const WINDOW_MS = 24 * 60 * 60 * 1000;

async function releaseReserved(date: string, reason: GenerateReason): Promise<GenerateResult> {
    try {
        await releaseAiApiCall(date);
    } catch {
        logAiSummary("usage_release_failed", {date});
    }
    return {ok: false, reason};
}

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
    const apiKey = xaiApiKey(env);
    if (!apiKey) {
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

    let reserved: Awaited<ReturnType<typeof reserveAiApiCall>>;
    try {
        reserved = await reserveAiApiCall(date);
    } catch {
        logAiSummary("usage_lock_timeout", {date});
        return {ok: false, reason: "locked"};
    }
    if (!reserved.ok) {
        logAiSummary("daily_cap", {date, calls: reserved.usage.calls}, "info");
        return {ok: false, reason: "daily_cap"};
    }

    const requested = await requestGrowSummary({
        userText,
        still,
        apiKey,
        fetchImpl: options.fetchImpl,
        env,
    });
    if (!requested.ok) {
        // Refund only a network error before connect. A sent request (HTTP
        // error, timeout, invalid JSON) has already spent the slot.
        if (requested.reason === "pre_connect") {
            return releaseReserved(date, "request_failed");
        }
        return {
            ok: false,
            reason: requested.reason === "invalid" ? "invalid_response" : "request_failed",
        };
    }
    const ai = applyUnmeasuredRanges(requested.ai, requested.illegal, stats);
    if (!ai) {
        return {ok: false, reason: "invalid_response"};
    }

    const mosaic = still || points.length > 0 ? buildMosaic(points, windowStartMs, ai.ranges) : emptyMosaic();
    const record: AiSummaryRecord = {
        date,
        generatedAt: new Date(nowMs).toISOString(),
        growId: grow.id,
        stage,
        stats,
        ai: {...ai, verdicts: verdictsFromMosaic(mosaic, ai.verdicts)},
        mosaic,
        imageUsed: still !== null,
    };
    try {
        await writeAiSummaryRecord(record);
    } catch {
        logAiSummary("write_failed", {date});
        return {ok: false, reason: "write_failed"};
    }
    logAiSummary("generated", {date, score: ai.score, imageUsed: record.imageUsed}, "info");
    return {ok: true, record, reused: false};
}
