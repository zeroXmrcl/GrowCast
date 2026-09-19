import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    EMPTY_LIVE_PUBLIC,
    GGS_PLUGIN_ID,
    GGS_STALE_AFTER_MS,
    fingerprint,
    parseIngestBody,
    parsePublicLiveBody,
    withStale,
} from "../lib/ggs-live.ts";
import {asLivePublic} from "../hooks/use-live-climate.ts";

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
            assert.equal(parsed.value.devices[0].actuators[0].alarm, null);
        }
    });

    it("keeps humidifier tank alarm 4", () => {
        const body = validBody();
        body.devices[0].actuators.push({
            id: "humidifier",
            label: "Humidifier",
            kind: "humidifier",
            on: true,
            level: 2,
            alarm: 4,
        });
        const parsed = parseIngestBody(body);
        assert.equal(parsed.ok, true);
        if (parsed.ok) {
            const humidifier = parsed.value.devices[0].actuators.find((item) => item.id === "humidifier");
            assert.equal(humidifier?.alarm, 4);
        }
    });

    it("keeps alarmLast climate threshold raise", () => {
        const body = validBody();
        (body.devices[0] as Record<string, unknown>).alarmLast = {devType: 2, alarmType: 2};
        const parsed = parseIngestBody(body);
        assert.equal(parsed.ok, true);
        if (parsed.ok) {
            assert.deepEqual(parsed.value.devices[0].alarmLast, {devType: 2, alarmType: 2});
        }
    });

    it("keeps isDay from the sensor and treats junk as unknown", () => {
        const withDay = validBody();
        (withDay.devices[0].sensor as Record<string, unknown>).isDay = true;
        const parsed = parseIngestBody(withDay);
        assert.equal(parsed.ok, true);
        if (parsed.ok) {
            assert.equal(parsed.value.devices[0].sensor.isDay, true);
        }
        const junk = validBody();
        (junk.devices[0].sensor as Record<string, unknown>).isDay = "daytime";
        const parsedJunk = parseIngestBody(junk);
        assert.equal(parsedJunk.ok, true);
        if (parsedJunk.ok) {
            assert.equal(parsedJunk.value.devices[0].sensor.isDay, null);
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

    it("strips serial from public live state", () => {
        const parsed = parseIngestBody(validBody());
        assert.equal(parsed.ok, true);
        if (!parsed.ok) return;
        const publicState = withStale(parsed.value, now);
        assert.equal("serial" in publicState.devices[0], false);
        assert.equal(publicState.devices[0].name, "SF-GGS-CB-7088");
    });
});

describe("parsePublicLiveBody", () => {
    it("accepts a snapshot without serial", () => {
        const body = {
            pluginId: GGS_PLUGIN_ID,
            source: "ggs-cloud",
            updatedAt: "2026-08-22T17:59:50.000Z",
            online: true,
            stale: false,
            devices: validBody().devices.map(({serial: _s, ...rest}) => rest),
        };
        const parsed = parsePublicLiveBody(body);
        assert.equal(parsed.ok, true);
        if (!parsed.ok) return;
        assert.equal("serial" in parsed.value.devices[0], false);
        assert.equal(parsed.value.devices[0].sensor.tempC, 25.4);
    });

    it("rejects mqttPwd", () => {
        const parsed = parsePublicLiveBody({...validBody(), mqttPwd: "nope"});
        assert.equal(parsed.ok, false);
    });

    it("rejects non-array devices", () => {
        const parsed = parsePublicLiveBody({...validBody(), devices: {not: "array"}});
        assert.equal(parsed.ok, false);
    });

    it("asLivePublic drops secret keys and bad device shapes", () => {
        assert.equal(asLivePublic({...validBody(), mqttPwd: "nope"}), null);
        assert.equal(asLivePublic({...validBody(), devices: "nope"}), null);
        const ok = asLivePublic({
            pluginId: GGS_PLUGIN_ID,
            source: "ggs-cloud",
            updatedAt: "2026-08-22T17:59:50.000Z",
            online: true,
            stale: false,
            devices: validBody().devices.map(({serial: _s, ...rest}) => rest),
        });
        assert.ok(ok);
        assert.equal("serial" in ok.devices[0], false);
    });
});
