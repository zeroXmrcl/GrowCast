import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    EMPTY_LIVE_PUBLIC,
    GGS_PLUGIN_ID,
    GGS_STALE_AFTER_MS,
    fingerprint,
    parseIngestBody,
    withStale,
} from "../lib/ggs-live.ts";

const now = Date.parse("2026-08-22T18:00:00.000Z");

function validBody() {
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
    };
}

describe("ggs live parse", () => {
    it("accepts a CB snapshot", () => {
        const parsed = parseIngestBody(validBody());
        assert.equal(parsed.ok, true);
        if (parsed.ok) {
            assert.equal(parsed.value.devices[0].sensor.tempC, 25.4);
        }
    });

    it("rejects secret-looking keys", () => {
        const parsed = parseIngestBody({...validBody(), mqttPwd: "nope"});
        assert.equal(parsed.ok, false);
    });

    it("rejects non-finite temps", () => {
        const body = validBody();
        body.devices[0].sensor.tempC = Number.NaN;
        assert.equal(parseIngestBody(body).ok, false);
    });

    it("rejects long serials", () => {
        const body = validBody();
        body.devices[0].serial = "X".repeat(33);
        assert.equal(parseIngestBody(body).ok, false);
    });

    it("rejects more than 20 devices", () => {
        const body = validBody();
        body.devices = Array.from({length: 21}, (_, i) => ({
            ...validBody().devices[0],
            serial: `90E5B1B870${String(i).padStart(2, "0")}`,
        }));
        assert.equal(parseIngestBody(body).ok, false);
    });

    it("rejects updatedAt more than 5 minutes in the future", () => {
        const body = validBody();
        body.updatedAt = new Date(Date.now() + 6 * 60_000).toISOString();
        assert.equal(parseIngestBody(body).ok, false);
    });

    it("marks stale after 120s", () => {
        const parsed = parseIngestBody(validBody());
        assert.equal(parsed.ok, true);
        if (!parsed.ok) return;
        const fresh = withStale(parsed.value, now);
        assert.equal(fresh.stale, false);
        assert.equal(fresh.online, true);
        const old = withStale(parsed.value, now + GGS_STALE_AFTER_MS);
        assert.equal(old.stale, true);
        assert.equal(old.online, false);
        assert.equal(old.devices[0].sensor.tempC, 25.4);
    });

    it("fingerprint ignores updatedAt", () => {
        const a = parseIngestBody(validBody());
        const b = parseIngestBody({...validBody(), updatedAt: "2026-08-22T17:59:59.000Z"});
        assert.equal(a.ok && b.ok, true);
        if (a.ok && b.ok) {
            assert.equal(fingerprint(a.value), fingerprint(b.value));
        }
    });

    it("empty public shape", () => {
        assert.equal(EMPTY_LIVE_PUBLIC.updatedAt, null);
        assert.equal(EMPTY_LIVE_PUBLIC.online, false);
        assert.equal(EMPTY_LIVE_PUBLIC.stale, true);
        assert.deepEqual(EMPTY_LIVE_PUBLIC.devices, []);
    });
});
