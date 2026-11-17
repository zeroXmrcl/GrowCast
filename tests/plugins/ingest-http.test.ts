import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {enablePlugin} from "../../lib/plugins/registry.ts";
import {ingestPluginPayload} from "../../lib/plugins/ingest.ts";
import {pluginIngestPostResponse, pluginHeartbeatPostResponse} from "../../lib/plugins/http.ts";
import {readPluginToken as readToken} from "../../lib/plugins/tokens.ts";
import {readPluginLive as live} from "../../lib/plugins/store.ts";
import {_resetPluginRateLimitsForTests} from "../../lib/plugins/rate-limit.ts";
import {SAMPLE_MANIFEST, withPluginHarness} from "./helpers.ts";

function ingestBody(metrics: Record<string, number>) {
    return {
        apiVersion: 1,
        observedAt: "2026-11-17T09:59:50.000Z",
        metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, {value}])),
    };
}

describe("plugin host ingest HTTP", {concurrency: 1}, () => {
    it("returns 204 for a valid ingest", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            await writePlugin("example", SAMPLE_MANIFEST);
            await enablePlugin("community.example");
            const result = await ingestPluginPayload("community.example", ingestBody({"battery.soc": 71}));
            assert.equal(result.ok, true);
            const snapshot = await live("community.example");
            assert.equal(snapshot.metrics["battery.soc"]?.value, 71);
            assert.equal(snapshot.metrics["pv.power"]?.value, null);
        });
    });

    it("returns 422 for unknown keys and 429 when faster than the interval", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            await writePlugin("example", SAMPLE_MANIFEST);
            await enablePlugin("community.example");
            const first = await ingestPluginPayload("community.example", ingestBody({"battery.soc": 10}));
            assert.equal(first.ok, true);
            const tooFast = await ingestPluginPayload("community.example", ingestBody({"battery.soc": 11}));
            assert.equal(tooFast.ok, false);
            if (!tooFast.ok) {
                assert.equal(tooFast.status, 429);
            }
            _resetPluginRateLimitsForTests();
            const bad = await ingestPluginPayload("community.example", ingestBody({nope: 1}));
            assert.equal(bad.ok, false);
            if (!bad.ok) {
                assert.equal(bad.status, 422);
            }
        });
    });

    it("requires the per-plugin bearer token", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            await writePlugin("example", SAMPLE_MANIFEST);
            await enablePlugin("community.example");
            const token = await readToken("community.example");
            assert.ok(token);
            const denied = await pluginIngestPostResponse(
                new Request("http://growcast.local/api/plugins/v1/community.example/ingest", {
                    method: "POST",
                    headers: {"content-type": "application/json", authorization: "Bearer wrong"},
                    body: JSON.stringify(ingestBody({"battery.soc": 1})),
                }),
                "community.example",
            );
            assert.equal(denied.status, 401);
            const ok = await pluginIngestPostResponse(
                new Request("http://growcast.local/api/plugins/v1/community.example/ingest", {
                    method: "POST",
                    headers: {"content-type": "application/json", authorization: `Bearer ${token}`},
                    body: JSON.stringify(ingestBody({"battery.soc": 12})),
                }),
                "community.example",
            );
            assert.equal(ok.status, 204);
            const beat = await pluginHeartbeatPostResponse(
                new Request("http://growcast.local/api/plugins/v1/community.example/heartbeat", {
                    method: "POST",
                    headers: {"content-type": "application/json", authorization: `Bearer ${token}`},
                    body: JSON.stringify({ok: true, status: "polling"}),
                }),
                "community.example",
            );
            assert.equal(beat.status, 204);
        });
    });
});
