import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {GGS_PLUGIN_ID, type GgsLivePublic} from "../lib/ggs-live.ts";
import {recoverLiveClimateOnSseFailure} from "../hooks/use-live-climate.ts";

function publicSnap(updatedAt: string, tempC = 25.4): GgsLivePublic {
    return {
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud",
        updatedAt,
        online: true,
        stale: false,
        devices: [
            {
                name: "SF-GGS-CB-7088",
                prefix: "CB",
                productType: "SF-GGS-CB",
                online: true,
                sensor: {
                    tempC,
                    humidityPct: 47.1,
                    vpd: 1.71,
                    co2: null,
                    ppfd: null,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                },
                actuators: [],
            },
        ],
    };
}

function jsonFetch(body: unknown, status = 200): typeof fetch {
    return (async (input) => {
        jsonFetch.urls.push(String(input));
        return new Response(JSON.stringify(body), {
            status,
            headers: {"Content-Type": "application/json"},
        });
    }) as typeof fetch;
}
jsonFetch.urls = [] as string[];

describe("recoverLiveClimateOnSseFailure", () => {
    it("on 503 fetches GET /api/data/live-climate and applies a newer snapshot", async () => {
        jsonFetch.urls = [];
        const current = publicSnap("2026-08-22T18:00:00.000Z", 24);
        const newer = publicSnap("2026-08-22T18:01:00.000Z", 26.2);
        const next = await recoverLiveClimateOnSseFailure({
            reason: 503,
            current,
            fetch: jsonFetch(newer),
        });
        assert.deepEqual(jsonFetch.urls, ["/api/data/live-climate"]);
        assert.equal(next?.updatedAt, newer.updatedAt);
        assert.equal(next?.devices[0].sensor.tempC, 26.2);
    });

    it("on EventSource error also polls JSON and keeps a newer current snapshot", async () => {
        jsonFetch.urls = [];
        const current = publicSnap("2026-08-22T18:02:00.000Z", 27);
        const older = publicSnap("2026-08-22T18:00:00.000Z", 20);
        const next = await recoverLiveClimateOnSseFailure({
            reason: "error",
            current,
            fetch: jsonFetch(older),
        });
        assert.deepEqual(jsonFetch.urls, ["/api/data/live-climate"]);
        assert.equal(next?.updatedAt, current.updatedAt);
        assert.equal(next?.devices[0].sensor.tempC, 27);
    });
});
