import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {airVpdKPa} from "../lib/air-vpd.ts";
import {EMPTY_LIVE_PUBLIC, GGS_PLUGIN_ID, GGS_STALE_AFTER_MS, type GgsLivePublic} from "../lib/ggs-live.ts";
import {
    climateBadge,
    climateMetrics,
    formatHumidityPct,
    formatHumidityPctTenths,
    formatRelativeAge,
    formatTempC,
    formatVpd,
    isClimateStale,
    mapDeviceTiles,
    preferLiveSnapshot,
    shouldShowLiveRow,
} from "../lib/live-climate-view.ts";

function snapshot(overrides: Partial<GgsLivePublic> = {}): GgsLivePublic {
    return {
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud",
        updatedAt: "2026-08-22T18:00:00.000Z",
        online: true,
        stale: false,
        devices: [
            {
                name: "SF-GGS-CB-7088",
                prefix: "CB",
                productType: "SF-GGS-CB",
                online: true,
                sensor: {
                    tempC: 25.3,
                    humidityPct: 47.1,
                    vpd: 9.99,
                    co2: null,
                    ppfd: null,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                },
                actuators: [
                    {id: "light", label: "Light", kind: "light", on: true, level: 11},
                    {id: "fan", label: "Fan", kind: "fan", on: false, level: 0},
                ],
            },
        ],
        ...overrides,
    };
}

describe("shouldShowLiveRow", () => {
    it("hides the empty public snapshot", () => {
        assert.equal(shouldShowLiveRow(null), false);
        assert.equal(shouldShowLiveRow(undefined), false);
        assert.equal(shouldShowLiveRow(EMPTY_LIVE_PUBLIC), false);
    });

    it("hides when updatedAt is null or devices are empty", () => {
        assert.equal(shouldShowLiveRow(snapshot({updatedAt: null})), false);
        assert.equal(shouldShowLiveRow(snapshot({devices: []})), false);
    });

    it("shows when a snapshot with devices exists", () => {
        assert.equal(shouldShowLiveRow(snapshot()), true);
    });
});

describe("homepage live-climate gate", () => {
    it("does not render LiveTentRow unless hasGgsLiveUi is true", () => {
        const src = readFileSync(path.join(process.cwd(), "app", "(site)", "page.tsx"), "utf8");
        assert.match(src, /hasGgsLiveUi\(/);
        assert.match(src, /showLiveClimate\s*\?\s*<LiveTentRow/);
        assert.equal(/^\s*<LiveTentRow\s*\/>/m.test(src), false);
    });

    it("shows humidity tenths on the dashboard card and whole percents on the OG card", () => {
        const dashSrc = readFileSync(
            path.join(process.cwd(), "components", "live-climate-card.tsx"),
            "utf8",
        );
        const ogSrc = readFileSync(path.join(process.cwd(), "lib", "share-card.ts"), "utf8");
        assert.match(dashSrc, /formatHumidityPctTenths/);
        assert.doesNotMatch(dashSrc, /formatHumidityPct\(/);
        assert.match(ogSrc, /formatHumidityPct\(/);
        assert.doesNotMatch(ogSrc, /formatHumidityPctTenths/);
    });
});

describe("preferLiveSnapshot", () => {
    it("does not let an empty body replace a timestamped snapshot", () => {
        const live = snapshot();
        assert.equal(preferLiveSnapshot(live, EMPTY_LIVE_PUBLIC), live);
        assert.equal(preferLiveSnapshot(live, snapshot({updatedAt: null, devices: []})), live);
    });

    it("replaces empty current with a timestamped snapshot", () => {
        const live = snapshot();
        assert.equal(preferLiveSnapshot(null, live), live);
        assert.equal(preferLiveSnapshot(EMPTY_LIVE_PUBLIC, live), live);
    });

    it("keeps the newer updatedAt when an older payload arrives", () => {
        const newer = snapshot({updatedAt: "2026-08-22T18:00:10.000Z"});
        const older = snapshot({updatedAt: "2026-08-22T18:00:00.000Z"});
        assert.equal(preferLiveSnapshot(newer, older), newer);
        assert.equal(preferLiveSnapshot(older, newer), newer);
    });

    it("takes an incoming snapshot with the same updatedAt", () => {
        const current = snapshot();
        const incoming = snapshot();
        assert.equal(preferLiveSnapshot(current, incoming), incoming);
    });
});

describe("climateMetrics", () => {
    it("computes VPD from temp and humidity and ignores sensor.vpd", () => {
        const metrics = climateMetrics(snapshot());
        assert.equal(metrics.tempC, 25.3);
        assert.equal(metrics.humidityPct, 47.1);
        const expected = airVpdKPa(25.3, 47.1);
        assert.equal(metrics.vpd, expected);
        assert.notEqual(metrics.vpd, 9.99);
        assert.equal(formatTempC(metrics.tempC), "25.3°");
        assert.equal(formatHumidityPct(metrics.humidityPct), "47%");
        assert.equal(formatHumidityPctTenths(metrics.humidityPct), "47.1%");
        assert.equal(formatVpd(metrics.vpd), expected === null ? "—" : expected.toFixed(2));
    });

    it("uses the first CB with a numeric climate reading", () => {
        const metrics = climateMetrics(snapshot({
            devices: [
                {
                    name: "strip",
                    prefix: "PS",
                    productType: "PS",
                    online: true,
                    sensor: {
                        tempC: 99,
                        humidityPct: 10,
                        vpd: 1,
                        co2: null,
                        ppfd: null,
                        tempSoilC: null,
                        humiditySoilPct: null,
                        ecSoil: null,
                    },
                    actuators: [],
                },
                {
                    name: "box",
                    prefix: "CB",
                    productType: "SF-GGS-CB",
                    online: true,
                    sensor: {
                        tempC: null,
                        humidityPct: null,
                        vpd: 1,
                        co2: null,
                        ppfd: null,
                        tempSoilC: null,
                        humiditySoilPct: null,
                        ecSoil: null,
                    },
                    actuators: [],
                },
                {
                    name: "box-2",
                    prefix: "CB",
                    productType: "SF-GGS-CB",
                    online: true,
                    sensor: {
                        tempC: 22.2,
                        humidityPct: null,
                        vpd: 4,
                        co2: null,
                        ppfd: null,
                        tempSoilC: null,
                        humiditySoilPct: null,
                        ecSoil: null,
                    },
                    actuators: [],
                },
            ],
        }));
        assert.equal(metrics.tempC, 22.2);
        assert.equal(metrics.humidityPct, null);
        assert.equal(metrics.vpd, null);
        assert.equal(formatHumidityPct(null), "—");
        assert.equal(formatHumidityPctTenths(null), "—");
        assert.equal(formatVpd(null), "—");
        assert.equal(formatTempC(null), "—");
    });
});

describe("mapDeviceTiles", () => {
    it("omits actuators that are absent from the payload", () => {
        const tiles = mapDeviceTiles(snapshot());
        assert.deepEqual(tiles.map((tile) => tile.id), ["light", "fan"]);
        assert.equal(tiles.some((tile) => tile.id === "humidifier"), false);
        assert.equal(tiles.some((tile) => tile.id === "blower"), false);
    });

    it("lists idle (on: false) and running (on: true) actuators", () => {
        const tiles = mapDeviceTiles(snapshot({
            devices: [
                {
                    ...snapshot().devices[0],
                    actuators: [
                        {id: "light", label: "Light", kind: "light", on: true, level: 11},
                        {id: "light2", label: "Light 2", kind: "light", on: false, level: 0},
                        {id: "humidifier", label: "Humidifier", kind: "humidifier", on: false, level: null},
                        {id: "outlet-1", label: "Outlet 1", kind: "outlet", on: true, level: 100},
                    ],
                },
            ],
        }));
        assert.equal(tiles.length, 4);
        assert.equal(tiles[0].running, true);
        assert.equal(tiles[0].levelText, "11%");
        assert.equal(tiles[0].accessibleName, "Light: on 11%");
        assert.equal(tiles[1].label, "Light 2");
        assert.equal(tiles[1].running, false);
        assert.equal(tiles[2].running, false);
        assert.equal(tiles[2].levelText, "OFF");
        assert.equal(tiles[2].accessibleName, "Humidifier: OFF");
        assert.equal(tiles[3].label, "Outlet 1");
        assert.equal(tiles[3].running, true);
    });

    it("shows OFF when the device is not running, even if a gear is stored", () => {
        const tiles = mapDeviceTiles(snapshot({
            devices: [
                {
                    ...snapshot().devices[0],
                    actuators: [
                        {id: "light", label: "Light", kind: "light", on: true, level: 0},
                        {id: "fan", label: "Fan", kind: "fan", on: true, level: 11},
                        {id: "blower", label: "Blower", kind: "blower", on: false, level: 40},
                        {id: "heater", label: "Heater", kind: "heater", on: false, level: 1},
                    ],
                },
            ],
        }));
        assert.equal(tiles[0].levelText, "OFF");
        assert.ok(tiles[0].accessibleName.includes("OFF"));
        assert.equal(tiles[1].levelText, "11%");
        assert.equal(tiles[2].levelText, "OFF");
        assert.equal(tiles[3].levelText, "OFF");
        assert.equal(tiles[3].accessibleName, "Heater: OFF");
    });

    it("scales GGS gear indexes to percent and labels dehumidifier LOW/HIGH", () => {
        const tiles = mapDeviceTiles(snapshot({
            devices: [
                {
                    ...snapshot().devices[0],
                    actuators: [
                        {id: "heater", label: "Heater", kind: "heater", on: true, level: 1},
                        {id: "humidifier", label: "Humidifier", kind: "humidifier", on: true, level: 1},
                        {id: "humidifier-4", label: "Humidifier", kind: "humidifier", on: true, level: 4},
                        {id: "fan", label: "Fan", kind: "fan", on: true, level: 5},
                        {id: "dehumidifier", label: "Dehumidifier", kind: "dehumidifier", on: true, level: 1},
                        {id: "dehumidifier-high", label: "Dehumidifier", kind: "dehumidifier", on: true, level: 2},
                        {id: "blower", label: "Blower", kind: "blower", on: true, level: 25},
                        {id: "light", label: "Light", kind: "light", on: true, level: 11},
                    ],
                },
            ],
        }));
        assert.equal(tiles[0].levelText, "10%");
        assert.equal(tiles[0].accessibleName, "Heater: on 10%");
        assert.equal(tiles[1].levelText, "25%");
        assert.equal(tiles[2].levelText, "100%");
        assert.equal(tiles[3].levelText, "50%");
        assert.equal(tiles[4].levelText, "LOW");
        assert.equal(tiles[4].accessibleName, "Dehumidifier: on LOW");
        assert.equal(tiles[5].levelText, "HIGH");
        assert.equal(tiles[5].accessibleName, "Dehumidifier: on HIGH");
        assert.equal(tiles[6].levelText, "25%");
        assert.equal(tiles[7].levelText, "11%");
    });
});

describe("climate freshness", () => {
    it("formats relative age in seconds then minutes", () => {
        const origin = Date.parse("2026-08-22T18:00:00.000Z");
        assert.equal(formatRelativeAge("2026-08-22T18:00:00.000Z", origin + 8_000), "8s ago");
        assert.equal(formatRelativeAge("2026-08-22T18:00:00.000Z", origin + 59_000), "59s ago");
        assert.equal(formatRelativeAge("2026-08-22T18:00:00.000Z", origin + 60_000), "1m ago");
        assert.equal(formatRelativeAge("2026-08-22T18:00:00.000Z", origin + 120_000), "2m ago");
    });

    it("shows LIVE when fresh and stale · relative when stale", () => {
        const origin = Date.parse("2026-08-22T18:00:00.000Z");
        assert.deepEqual(climateBadge(false, "2026-08-22T18:00:00.000Z", origin), {
            kind: "live",
            text: "LIVE",
        });
        assert.deepEqual(climateBadge(true, "2026-08-22T18:00:00.000Z", origin + 8_000), {
            kind: "stale",
            text: "stale · 8s ago",
        });
    });

    it("treats server stale, aged updatedAt, and quiet SSE as stale", () => {
        const now = Date.parse("2026-08-22T18:02:00.000Z");
        assert.equal(isClimateStale(snapshot({stale: true}), now, now), true);
        assert.equal(
            isClimateStale(snapshot({updatedAt: "2026-08-22T18:00:00.000Z"}), now, now),
            true,
        );
        assert.equal(
            isClimateStale(
                snapshot({updatedAt: "2026-08-22T18:01:50.000Z"}),
                now,
                now - GGS_STALE_AFTER_MS,
            ),
            true,
        );
        assert.equal(
            isClimateStale(
                snapshot({updatedAt: "2026-08-22T18:01:50.000Z"}),
                now,
                now,
            ),
            false,
        );
    });
});
