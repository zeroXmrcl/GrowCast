export const AI_SUMMARY_REGENERATE_WINDOW_MS = 10 * 60 * 1000;
export const AI_SUMMARY_REGENERATE_LIMIT = 1;

type Bucket = {
    count: number;
    resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function allowAiSummaryRegenerate(
    key: string,
    nowMs: number = Date.now(),
): {ok: true} | {ok: false; retryAfterSeconds: number} {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= nowMs) {
        buckets.set(key, {count: 1, resetAt: nowMs + AI_SUMMARY_REGENERATE_WINDOW_MS});
        return {ok: true};
    }
    if (existing.count < AI_SUMMARY_REGENERATE_LIMIT) {
        existing.count += 1;
        return {ok: true};
    }
    return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
    };
}

export function _resetAiSummaryRateLimitForTests(): void {
    buckets.clear();
}
