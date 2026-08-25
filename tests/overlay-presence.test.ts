import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {EMPTY_LIVE_PUBLIC, GGS_PLUGIN_ID, type GgsLivePublic} from "../lib/ggs-live.ts";
import type {EnergyPublicDto} from "../lib/energy/types.ts";
import {
    applyOverlayEnergyPoll,
    overlayClimateGearVisible,
    overlayEnergyVisible,
} from "../lib/overlay-presence.ts";
import {OVERLAY_GROW_PATH, OVERLAY_GROW_POLL_MS, parseOverlayGrowBody} from "../lib/overlay-grow.ts";

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
                    vpd: null,
                    co2: null,
                    ppfd: null,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                },
                actuators: [],
            },
        ],
        ...overrides,
    };
}

function energyDto(overrides: Partial<EnergyPublicDto> = {}): EnergyPublicDto {
    return {
        grow: "current",
        estimated: true,
        tariffKind: "public",
        appliedTariffEurPerKwh: 0.3,
        startedAt: null,
        empty: false,
        nowWatts: 40,
        nowWattsStale: false,
        windows: {
            today: {kWh: 0.1, costEur: 0.03},
            "7d": {kWh: 0.1, costEur: 0.03},
            "30d": {kWh: 0.1, costEur: 0.03},
            grow: {kWh: 0.1, costEur: 0.03},
        },
        kWh: 0.1,
        costEur: 0.03,
        devices: [],
        ...overrides,
    };
}

describe("overlay climate/gear presence", () => {
    it("shows climate and gear for a live snapshot", () => {
        assert.equal(overlayClimateGearVisible(snapshot()), true);
    });

    it("hides climate and gear for an empty public snapshot", () => {
        assert.equal(overlayClimateGearVisible(null), false);
        assert.equal(overlayClimateGearVisible(undefined), false);
        assert.equal(overlayClimateGearVisible(EMPTY_LIVE_PUBLIC), false);
    });
});

describe("overlay energy presence", () => {
    it("shows energy for a good DTO, including null nowWatts", () => {
        assert.equal(overlayEnergyVisible(energyDto()), true);
        assert.equal(overlayEnergyVisible(energyDto({nowWatts: null})), true);
    });

    it("hides energy when empty is true or the DTO is missing", () => {
        assert.equal(overlayEnergyVisible(energyDto({empty: true})), false);
        assert.equal(overlayEnergyVisible(null), false);
        assert.equal(overlayEnergyVisible(undefined), false);
    });
});

describe("applyOverlayEnergyPoll", () => {
    it("keeps the last good DTO when the fetch fails", () => {
        const good = energyDto();
        assert.equal(applyOverlayEnergyPoll(good, null), good);
        assert.equal(applyOverlayEnergyPoll(null, null), null);
    });

    it("unmounts when a successful response is empty", () => {
        assert.equal(applyOverlayEnergyPoll(energyDto(), energyDto({empty: true})), null);
    });

    it("adopts a good DTO", () => {
        const next = energyDto({nowWatts: 12});
        assert.equal(applyOverlayEnergyPoll(null, next), next);
    });
});

describe("overlay grow poll", () => {
    it("polls current-grow every few seconds", () => {
        assert.equal(OVERLAY_GROW_PATH, "/api/data/current-grow");
        assert.equal(OVERLAY_GROW_POLL_MS, 5_000);
    });
});

describe("parseOverlayGrowBody", () => {
    it("reads identity and overlayLayout from current-grow JSON", () => {
        const parsed = parseOverlayGrowBody({
            plant: "Tomatoes",
            name: "Run",
            details: {
                seededAt: "2026-03-01",
                stage: "Seed",
                lightSchedule: "12/12",
                strain: "Godfather OG",
            },
            overlayLayout: "bottom-bar",
            overlayStream: "include",
            streamUrl: "https://stream.0xmarcel.com/growcam/",
        });
        assert.deepEqual(parsed, {
            plant: "Tomatoes",
            name: "Run",
            seededAt: "2026-03-01",
            overlayLayout: "bottom-bar",
            overlayStream: "include",
            streamUrl: "https://stream.0xmarcel.com/growcam/",
            stage: "Seed",
            lightSchedule: "12/12",
            strain: "Godfather OG",
        });
    });

    it("defaults junk layout and stream mode and rejects non-objects", () => {
        const parsed = parseOverlayGrowBody({plant: "Basil", overlayLayout: "wide"});
        assert.equal(parsed?.overlayLayout, "left-rail");
        assert.equal(parsed?.overlayStream, "transparent");
        assert.equal(parsed?.stage, "");
        assert.equal(parsed?.lightSchedule, "");
        assert.equal(parsed?.strain, "");
        assert.equal(parseOverlayGrowBody(null), null);
        assert.equal(parseOverlayGrowBody("grow"), null);
    });
});
