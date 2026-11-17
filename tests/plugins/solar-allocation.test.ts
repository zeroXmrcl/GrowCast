import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    allocateSolarInstant,
    nextBatteryMix,
    valueSolarCost,
} from "../../plugins/solar/host/allocation.ts";

describe("solar allocation math", () => {
    it("splits proportionally by consumption when solar cannot cover the house", () => {
        const split = allocateSolarInstant({
            pvW: 400,
            batteryW: 0,
            gridW: 600,
            houseW: 1000,
            tentW: 250,
            batterySolarMix: 1,
        }, "proportional");
        assert.equal(split.tentFromSolarW, 100);
        assert.equal(split.houseOtherFromSolarW, 300);
        assert.equal(split.tentFromGridW, 150);
        assert.equal(split.houseOtherFromGridW, 450);
        assert.equal(split.exportW, 0);
        assert.equal(split.solarShareOfTent, 0.4);
    });

    it("gives tent first claim on scarce solar", () => {
        const split = allocateSolarInstant({
            pvW: 400,
            batteryW: 0,
            gridW: 600,
            houseW: 1000,
            tentW: 250,
            batterySolarMix: 1,
        }, "tent-first");
        assert.equal(split.tentFromSolarW, 250);
        assert.equal(split.houseOtherFromSolarW, 150);
        assert.equal(split.tentFromGridW, 0);
        assert.equal(split.houseOtherFromGridW, 600);
    });

    it("gives tent last claim on scarce solar", () => {
        const split = allocateSolarInstant({
            pvW: 400,
            batteryW: 0,
            gridW: 600,
            houseW: 1000,
            tentW: 250,
            batterySolarMix: 1,
        }, "tent-last");
        assert.equal(split.tentFromSolarW, 0);
        assert.equal(split.houseOtherFromSolarW, 400);
        assert.equal(split.tentFromGridW, 250);
        assert.equal(split.houseOtherFromGridW, 350);
    });

    it("counts battery discharge as solar by default", () => {
        const split = allocateSolarInstant({
            pvW: 100,
            batteryW: 300,
            gridW: 600,
            houseW: 1000,
            tentW: 250,
            batterySolarMix: 1,
        }, "proportional");
        assert.equal(split.solarSupplyW, 400);
        assert.equal(split.tentFromSolarW, 100);
    });

    it("can treat battery discharge as grid when configured", () => {
        const split = allocateSolarInstant({
            pvW: 100,
            batteryW: 300,
            gridW: 600,
            houseW: 1000,
            tentW: 250,
            batterySolarMix: 1,
        }, "proportional", "always-grid");
        assert.equal(split.solarSupplyW, 100);
        assert.equal(split.tentFromSolarW, 25);
    });

    it("exports leftover solar when production covers the house", () => {
        const split = allocateSolarInstant({
            pvW: 3000,
            batteryW: 0,
            gridW: -1500,
            houseW: 1500,
            tentW: 400,
            batterySolarMix: 1,
        });
        assert.equal(split.tentFromSolarW, 400);
        assert.equal(split.houseOtherFromSolarW, 1100);
        assert.equal(split.tentFromGridW, 0);
        assert.equal(split.exportW, 1500);
    });

    it("keeps missing readings missing instead of substituting 0", () => {
        const split = allocateSolarInstant({
            pvW: null,
            batteryW: 100,
            gridW: 50,
            houseW: 200,
            tentW: 80,
            batterySolarMix: 1,
        });
        assert.equal(split.tentFromSolarW, null);
        assert.equal(split.solarSupplyW, null);
        assert.ok(split.missing.includes("pvW"));
        assert.equal(split.tentFromGridW, null);
    });

    it("keeps tent energy missing when GGS tent watts are missing", () => {
        const split = allocateSolarInstant({
            pvW: 400,
            batteryW: 0,
            gridW: 100,
            houseW: 500,
            tentW: null,
            batterySolarMix: 1,
        });
        assert.equal(split.tentFromSolarW, null);
        assert.ok(split.missing.includes("tentW"));
    });

    it("values solar at zero or at the feed-in tariff", () => {
        const zero = valueSolarCost({
            tentFromSolarKwh: 2,
            tentFromGridKwh: 1,
            solarKwhValueEur: 0,
            gridTariffEurPerKwh: 0.3,
        });
        assert.equal(zero.tentSolarEur, 0);
        assert.equal(zero.tentGridEur, 0.3);
        const opportunity = valueSolarCost({
            tentFromSolarKwh: 2,
            tentFromGridKwh: 1,
            solarKwhValueEur: 0.08,
            gridTariffEurPerKwh: 0.3,
        });
        assert.equal(opportunity.tentSolarEur, 0.16);
        assert.equal(opportunity.tentTotalEur, 0.46);
    });

    it("does not invent a cost when a kWh input is missing", () => {
        const cost = valueSolarCost({
            tentFromSolarKwh: null,
            tentFromGridKwh: 1,
            solarKwhValueEur: 0,
            gridTariffEurPerKwh: 0.3,
        });
        assert.equal(cost.tentSolarEur, null);
        assert.equal(cost.tentTotalEur, null);
    });

    it("updates battery mix from PV-excess charging", () => {
        const mix = nextBatteryMix(0, -1000, 2000, 500, 14000, 3600);
        assert.ok(mix !== null && mix > 0);
    });
});
