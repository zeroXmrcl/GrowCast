import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("ai summary surface", () => {
    it("starts the in-app scheduler on boot and keeps xAI server-only", () => {
        const instrumentation = src("instrumentation.ts");
        const generate = src(path.join("lib", "ai-summary", "generate.ts"));
        const client = src(path.join("lib", "ai-summary", "client.ts"));
        const config = src(path.join("lib", "ai-summary", "config.ts"));
        const prompt = src(path.join("lib", "ai-summary", "prompt.ts"));
        const publicApi = src(path.join("app", "api", "data", "ai-summary", "route.ts"));
        const action = src(path.join("app", "admin", "actions.ts"));
        const http = src(path.join("lib", "ggs-live-http.ts"));
        const archives = src(path.join("lib", "archives.ts"));

        assert.match(instrumentation, /startAiSummaryScheduler/);
        assert.match(http, /recordClimateOnIngestBestEffort/);
        assert.match(archives, /stageClimateArchive/);
        assert.match(archives, /stageAiSummaryArchive/);
        assert.match(generate, /stageContextFromGrow/);
        assert.doesNotMatch(generate, /temperatureDay|humidityNight/);
        assert.match(prompt, /KEINE Zielwerte/);
        assert.match(client, /XAI_API_KEY|xaiApiKey/);
        assert.match(config, /api\.x\.ai/);
        assert.match(client, /chat\/completions/);
        assert.match(client, /max_tokens/);
        assert.match(client, /XAI_REQUEST_TIMEOUT_MS|AbortController/);
        assert.match(generate, /reserveAiApiCall/);
        assert.match(generate, /daily_cap/);
        assert.match(src(path.join("lib", "ai-summary", "usage.ts")), /AI_SUMMARY_DAILY_API_CAP/);
        assert.match(src(path.join("lib", "ai-summary", "image.ts")), /MAX_VISION_BYTES/);
        assert.match(src(path.join("lib", "ai-summary", "scheduler.ts")), /__growcastAiSummaryScheduler/);
        assert.match(src(path.join("lib", "ai-summary", "scheduler.ts")), /tryHoldLeaderLease/);
        assert.match(publicApi, /export async function GET/);
        assert.doesNotMatch(publicApi, /export async function POST/);
        assert.match(action, /requireAdmin/);
        assert.match(action, /regenerateAiSummaryAction/);
        assert.match(action, /allowAiSummaryRegenerate/);
        assert.doesNotMatch(publicApi, /XAI_API_KEY/);
        assert.doesNotMatch(src(path.join("components", "ai-summary-card.tsx")), /\/api\/snapshots\//);
    });
});
