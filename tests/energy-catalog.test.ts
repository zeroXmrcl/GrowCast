import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    blowerWatts,
    catalogWatts,
    lightWatts,
    lookupWatts,
} from "../lib/energy/catalog.ts";

describe("energy catalog", () => {
    it("matches locked light table points via the linear formula", () => {
        assert.equal(lightWatts(10), 34);
        assert.equal(lightWatts(40), 124);
        assert.equal(lightWatts(60), 185);
        assert.equal(lightWatts(100), 305);
        assert.equal(catalogWatts("light", "light", "40", true), 124);
        assert.equal(catalogWatts("light", "light2", "100", true), 305);
        assert.equal(catalogWatts("light", "light", "0", true), 0);
        assert.equal(catalogWatts("light", "light", "40", false), 0);
    });

    it("uses the blower cube formula at or above 25%", () => {
        assert.ok(Math.abs(blowerWatts(25) - 3.478125) < 1e-9);
        assert.ok(Math.abs(blowerWatts(50) - 6.125) < 1e-9);
        assert.ok(Math.abs(blowerWatts(70) - 11.4006) < 1e-3);
        assert.equal(blowerWatts(20), 0);
        assert.equal(catalogWatts("blower", "blower", "20", true), 0);
    });

    it("uses oscillation-on clip gears and locked heater/humid/dehum tables", () => {
        assert.equal(catalogWatts("fan", "fan", "5", true), 4.5);
        assert.equal(catalogWatts("fan", "fan", "8", true), 6.7);
        assert.equal(catalogWatts("heater", "heater", "1", true), 41);
        assert.equal(catalogWatts("heater", "heater", "7", true), 255);
        assert.equal(catalogWatts("heater", "heater", "10", true), 540);
        assert.equal(catalogWatts("humidifier", "humidifier", "2", true), 22);
        assert.equal(catalogWatts("humidifier", "humidifier", "4", true), 30);
        assert.equal(catalogWatts("dehumidifier", "dehumidifier", "1", true), 215);
        assert.equal(catalogWatts("dehumidifier", "dehumidifier", "2", true), 230);
        assert.equal(catalogWatts("outlet", "outlet-1", "1", true), 0);
        assert.equal(catalogWatts("fan", "fan", "11", true), 0);
    });

    it("applies override lookup order and treats unmatched as 0 W", () => {
        const key = "90E5B1B87088:heater";
        assert.equal(
            lookupWatts({
                key,
                kind: "heater",
                id: "heater",
                level: "1",
                on: true,
                overrides: [{key, wattsByLevel: {"1": 80}, watts: 160}],
            }),
            80,
        );
        assert.equal(
            lookupWatts({
                key,
                kind: "heater",
                id: "heater",
                level: "2",
                on: true,
                overrides: [{key, wattsByLevel: {"1": 80}, watts: 160}],
            }),
            160,
        );
        assert.equal(
            lookupWatts({
                key,
                kind: "heater",
                id: "heater",
                level: "1",
                on: true,
                overrides: [],
            }),
            41,
        );
        assert.equal(
            lookupWatts({
                key: "90E5B1B87088:outlet-1",
                kind: "outlet",
                id: "outlet-1",
                level: "1",
                on: true,
                overrides: [],
            }),
            0,
        );
        assert.equal(
            lookupWatts({
                key: "90E5B1B87088:outlet-1",
                kind: "outlet",
                id: "outlet-1",
                level: "1",
                on: true,
                overrides: [{key: "90E5B1B87088:outlet-1", watts: 40}],
            }),
            40,
        );
        assert.equal(
            lookupWatts({
                key,
                kind: "heater",
                id: "heater",
                level: "1",
                on: false,
                overrides: [{key, watts: 999}],
            }),
            0,
        );
    });

    it("matches the locked veg and flower example totals as integer W", () => {
        const veg =
            catalogWatts("light", "light", "40", true) +
            catalogWatts("blower", "blower", "50", true) +
            catalogWatts("fan", "fan", "5", true) +
            catalogWatts("humidifier", "humidifier", "2", true);
        assert.equal(Math.round(veg), 157);

        const flower =
            catalogWatts("light", "light", "100", true) +
            catalogWatts("blower", "blower", "70", true) +
            catalogWatts("fan", "fan", "8", true) +
            catalogWatts("dehumidifier", "dehumidifier", "2", true);
        assert.equal(Math.round(flower), 553);
    });
});
