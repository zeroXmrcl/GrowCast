type Bucket = {lastMs: number};

const ingestBuckets = new Map<string, Bucket>();

export function _resetPluginRateLimitsForTests(): void {
    ingestBuckets.clear();
}

export function allowPluginIngest(pluginId: string, intervalMs: number, nowMs = Date.now()): boolean {
    const minInterval = Math.max(1000, intervalMs);
    const previous = ingestBuckets.get(pluginId);
    if (previous && nowMs - previous.lastMs < minInterval) {
        return false;
    }
    ingestBuckets.set(pluginId, {lastMs: nowMs});
    return true;
}

export function ingestIntervalMs(config: Record<string, string | number | boolean>, fallback = 10_000): number {
    const raw = config.intervalS;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.max(1, raw) * 1000;
    }
    return fallback;
}
