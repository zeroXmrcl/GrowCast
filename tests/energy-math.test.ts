import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {lookupWatts} from "../lib/energy/catalog.ts";
import {costEur, round1, round2, secondsToKwh, totalsForDays} from "../lib/energy/math.ts";
import type {EnergyActuatorRef, EnergyDayFile} from "../lib/energy/types.ts";

const heaterRef: EnergyActuatorRef = {
    key: "90E5B1B87088:heater",
    serial: "90E5B1B87088",
    name: "SF-GGS-CB-7088",
    id: "heater",
    label: "Heater",
    kind: "heater",
};

function dayWithHeater(date: string, hour: string, seconds: number, level = "1"): EnergyDayFile {
    return {
        date,
        hours: {
            [hour]: {
                [heaterRef.key]: {[level]: seconds},
            },
        },
    };
}

describe("energy math", () => {
    it("converts duty seconds × watts into kWh", () => {
        assert.equal(secondsToKwh(1000, 3600), 1);
        assert.equal(secondsToKwh(41, 600), (41 * 600) / 3_600_000);
    });

    it("returns null cost when the tariff is blank, never 0.00", () => {
        assert.equal(costEur(1.23, null), null);
        assert.equal(costEur(0, null), null);
        assert.equal(costEur(2, 0.3), 0.6);
    });

    it("applies catalog and overrides to buckets and recomputes after a watt change", () => {
        const days = [dayWithHeater("2026-08-23", "14", 3600)];
        const refs = new Map([[heaterRef.key, heaterRef]]);
        const catalog = totalsForDays(days, null, refs, []);
        assert.ok(Math.abs(catalog.kWh - 0.041) < 1e-9);

        const overridden = totalsForDays(days, null, refs, [
            {key: heaterRef.key, wattsByLevel: {"1": 100}},
        ]);
        assert.equal(overridden.kWh, 0.1);
        assert.notEqual(catalog.kWh, overridden.kWh);
    });

    it("uses public vs private tariff only at € time", () => {
        const kWh = 2;
        assert.equal(round2(costEur(kWh, 0.3) ?? 0), 0.6);
        assert.equal(round2(costEur(kWh, 0.32) ?? 0), 0.64);
        assert.equal(round1(kWh), 2);
    });

    it("looks up watts independently of stored kWh", () => {
        const watts = lookupWatts({
            key: heaterRef.key,
            kind: "heater",
            id: "heater",
            level: "10",
            on: true,
            overrides: [],
        });
        assert.equal(watts, 540);
        assert.equal(secondsToKwh(watts, 3600), 0.54);
    });

    it("infers catalog kind from the actuator id when refs are missing", () => {
        const days = [dayWithHeater("2026-08-23", "14", 3600)];
        const inferred = totalsForDays(days, null, new Map(), []);
        assert.ok(Math.abs(inferred.kWh - 0.041) < 1e-9);

        const lightDays: EnergyDayFile[] = [
            {
                date: "2026-08-23",
                hours: {"12": {"AABBCCDDEEFF:light2": {"40": 3600}}},
            },
        ];
        const light = totalsForDays(lightDays, null, new Map(), []);
        assert.ok(Math.abs(light.kWh - 0.124) < 1e-9);
    });
});
