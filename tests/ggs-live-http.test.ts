import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, it} from "node:test";
import {GGS_PLUGIN_ID} from "../lib/ggs-live.ts";
import {
    GGS_MAX_SSE_SUBSCRIBERS,
    _resetGgsHubForTests,
    publishLive,
    subscribeLive,
    subscriberCount,
} from "../lib/ggs-live-hub.ts";
import {
    _resetIngestRateForTests,
    liveClimateGetResponse,
    liveClimateIngestResponse,
    liveClimateStreamResponse,
} from "../lib/ggs-live-http.ts";
import {EMPTY_LIVE_PUBLIC, withStale} from "../lib/ggs-live.ts";
import {saveGgsLive} from "../lib/ggs-live-store.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-ggs-http-"));
    const previousDir = process.env.GROWCAST_DATA_DIR;
    const previousToken = process.env.GROWCAST_MESH_TOKEN;
    process.env.GROWCAST_DATA_DIR = dir;
    process.env.GROWCAST_MESH_TOKEN = "test-mesh-token";
    _resetGgsHubForTests();
    _resetIngestRateForTests();
    try {
        return await fn(dir);
    } finally {
        _resetGgsHubForTests();
        _resetIngestRateForTests();
        if (previousDir === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previousDir;
        }
        if (previousToken === undefined) {
            delete process.env.GROWCAST_MESH_TOKEN;
        } else {
            process.env.GROWCAST_MESH_TOKEN = previousToken;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function validBody(overrides: Record<string, unknown> = {}) {
    return {
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud",
        updatedAt: "2026-08-22T17:59:50.000Z",
        online: true,
        devices: [
            {
                serial: "90E5B1B87088",
                name: "SF-GGS-CB-7088",
                prefix: "CB",
                productType: "SF-GGS-CB",
                online: true,
                sensor: {
                    tempC: 25.4,
                    humidityPct: 47.2,
                    vpd: 1.71,
                    co2: null,
                    ppfd: null,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                },
                actuators: [
                    {id: "light", label: "Light", kind: "light", on: true, level: 11},
                    {id: "blower", label: "Blower", kind: "blower", on: true, level: 25},
                ],
            },
        ],
        ...overrides,
    };
}

function ingestRequest(body: unknown, token = "test-mesh-token"): Request {
    return new Request("http://localhost/api/mesh/growcast.ggs/state", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

afterEach(() => {
    _resetGgsHubForTests();
    _resetIngestRateForTests();
});

describe("ggs live hub", () => {
    it("does not emit snapshot when fingerprint is unchanged", () => {
        _resetGgsHubForTests();
        let snapshots = 0;
        const stop = subscribeLive((event) => {
            if (event === "snapshot") {
                snapshots += 1;
            }
        });
        const a = withStale({
            ...validBody(),
            updatedAt: "2026-08-22T17:59:50.000Z",
            pluginId: GGS_PLUGIN_ID,
            source: "ggs-cloud",
            devices: validBody().devices,
        } as never);
        const first = publishLive({
            pluginId: GGS_PLUGIN_ID,
            source: "ggs-cloud",
            updatedAt: "2026-08-22T17:59:50.000Z",
            online: true,
            stale: false,
            devices: validBody().devices as never,
        });
        const second = publishLive({
            pluginId: GGS_PLUGIN_ID,
            source: "ggs-cloud",
            updatedAt: "2026-08-22T17:59:59.000Z",
            online: true,
            stale: false,
            devices: validBody().devices as never,
        });
        assert.equal(first.changed, true);
        assert.equal(second.changed, false);
        assert.equal(snapshots, 1);
        stop();
        void a;
    });

    it("tracks subscriber count", () => {
        _resetGgsHubForTests();
        assert.equal(subscriberCount(), 0);
        const stop = subscribeLive(() => undefined);
        assert.equal(subscriberCount(), 1);
        stop();
        assert.equal(subscriberCount(), 0);
    });
});

describe("live climate GET", () => {
    it("returns empty public shape when missing", async () => {
        await withTempDataDir(async () => {
            const response = await liveClimateGetResponse();
            assert.equal(response.status, 200);
            assert.match(response.headers.get("cache-control") ?? "", /no-store/);
            const body = await response.json();
            assert.equal(body.updatedAt, EMPTY_LIVE_PUBLIC.updatedAt);
            assert.equal(body.online, false);
            assert.equal(body.stale, true);
            assert.deepEqual(body.devices, []);
        });
    });

    it("returns saved tempC", async () => {
        await withTempDataDir(async () => {
            const parsed = (await import("../lib/ggs-live.ts")).parseIngestBody(
                validBody({updatedAt: new Date().toISOString()}),
            );
            assert.equal(parsed.ok, true);
            if (!parsed.ok) return;
            await saveGgsLive(parsed.value);
            const response = await liveClimateGetResponse();
            const body = await response.json();
            assert.equal(body.devices[0].sensor.tempC, 25.4);
            assert.equal(body.stale, false);
        });
    });

    it("marks stale after 121s while keeping last numbers", async () => {
        await withTempDataDir(async () => {
            const old = {
                ...validBody(),
                updatedAt: new Date(Date.now() - 121_000).toISOString(),
            };
            const parsed = (await import("../lib/ggs-live.ts")).parseIngestBody(old);
            assert.equal(parsed.ok, true);
            if (!parsed.ok) return;
            await saveGgsLive(parsed.value);
            const response = await liveClimateGetResponse();
            const body = await response.json();
            assert.equal(body.stale, true);
            assert.equal(body.online, false);
            assert.equal(body.devices[0].sensor.tempC, 25.4);
        });
    });
});

describe("live climate SSE", () => {
    it("sends a snapshot event on connect", async () => {
        await withTempDataDir(async () => {
            const parsed = (await import("../lib/ggs-live.ts")).parseIngestBody(
                validBody({updatedAt: new Date().toISOString()}),
            );
            assert.equal(parsed.ok, true);
            if (!parsed.ok) return;
            await saveGgsLive(parsed.value);
            const response = await liveClimateStreamResponse();
            assert.equal(response.status, 200);
            assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
            assert.equal(response.headers.get("x-accel-buffering"), "no");
            const reader = response.body?.getReader();
            assert.ok(reader);
            const {value} = await reader.read();
            const text = new TextDecoder().decode(value);
            assert.match(text, /event: snapshot/);
            assert.match(text, /25\.4/);
            await reader.cancel();
        });
    });

    it("returns 503 when the subscriber cap is reached", async () => {
        await withTempDataDir(async () => {
            const stops: Array<() => void> = [];
            for (let i = 0; i < GGS_MAX_SSE_SUBSCRIBERS; i += 1) {
                stops.push(subscribeLive(() => undefined));
            }
            const response = await liveClimateStreamResponse();
            assert.equal(response.status, 503);
            for (const stop of stops) {
                stop();
            }
        });
    });
});

describe("live climate ingest", () => {
    it("denies missing and wrong bearer", async () => {
        await withTempDataDir(async () => {
            const noAuth = await liveClimateIngestResponse(
                new Request("http://localhost/api/mesh/growcast.ggs/state", {
                    method: "POST",
                    body: JSON.stringify(validBody()),
                }),
                GGS_PLUGIN_ID,
            );
            assert.equal(noAuth.status, 401);

            const wrong = await liveClimateIngestResponse(ingestRequest(validBody(), "wrong"), GGS_PLUGIN_ID);
            assert.equal(wrong.status, 401);
        });
    });

    it("404s unknown plugin ids", async () => {
        await withTempDataDir(async () => {
            const response = await liveClimateIngestResponse(
                ingestRequest(validBody()),
                "growcast.timelapse",
            );
            assert.equal(response.status, 404);
        });
    });

    it("rejects secret keys", async () => {
        await withTempDataDir(async () => {
            const response = await liveClimateIngestResponse(
                ingestRequest({...validBody(), mqttPwd: "nope"}),
                GGS_PLUGIN_ID,
            );
            assert.equal(response.status, 400);
        });
    });

    it("writes state and serves it on GET", async () => {
        await withTempDataDir(async () => {
            const posted = await liveClimateIngestResponse(
                ingestRequest(validBody({updatedAt: new Date().toISOString()})),
                GGS_PLUGIN_ID,
            );
            assert.equal(posted.status, 204);
            const get = await liveClimateGetResponse();
            const body = await get.json();
            assert.equal(body.devices[0].sensor.tempC, 25.4);
        });
    });

    it("rate-limits a second POST within 2s", async () => {
        await withTempDataDir(async () => {
            const first = await liveClimateIngestResponse(ingestRequest(validBody()), GGS_PLUGIN_ID);
            const second = await liveClimateIngestResponse(ingestRequest(validBody()), GGS_PLUGIN_ID);
            assert.equal(first.status, 204);
            assert.equal(second.status, 429);
        });
    });

    it("notifies SSE subscribers on change", async () => {
        await withTempDataDir(async () => {
            const events: string[] = [];
            const stop = subscribeLive((event) => {
                events.push(event);
            });
            await liveClimateIngestResponse(ingestRequest(validBody()), GGS_PLUGIN_ID);
            stop();
            assert.equal(events.includes("snapshot"), true);
        });
    });
});
