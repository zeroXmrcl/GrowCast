import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    averageWattsInBucket,
    integrateWattsToKwh,
    parseSolarRange,
    rangeWindowMs,
    solarKwhValueEur,
    tentSavings,
} from "../../plugins/solar/host/ranges.ts";
import {buildSolarView} from "../../plugins/solar/host/view.ts";

const TZ = "Europe/Berlin";
const GROW = {active: true, startedAt: "2026-10-18", endedAt: null as string | null};
const NO_GROW = {active: false, startedAt: null, endedAt: null};

describe("solar range aggregation", () => {
    it("parses known windows and defaults to live", () => {
        assert.equal(parseSolarRange("24h"), "24h");
        assert.equal(parseSolarRange("grow"), "grow");
        assert.equal(parseSolarRange("nope"), "live");
    });

    it("binds This Grow to the current cycle start and disables it without a grow", () => {
        const now = Date.parse("2026-11-17T10:42:00.000Z");
        const open = rangeWindowMs("grow", now, GROW, TZ);
        assert.equal(open.ok, true);
        if (open.ok) {
            assert.ok(open.startMs < now);
            assert.equal(open.endMs, now);
        }
        const closed = rangeWindowMs("grow", now, NO_GROW, TZ);
        assert.equal(closed.ok, false);
        if (!closed.ok) {
            assert.equal(closed.reason, "no-grow");
        }
    });

    it("integrates trapezoids and keeps all-gap windows as missing, not 0", () => {
        const start = 1_000_000;
        const hour = 3_600_000;
        const kwh = integrateWattsToKwh([
            {tMs: start, watts: 1000},
            {tMs: start + hour, watts: 1000},
        ], start, start + hour);
        assert.equal(kwh, 1);
        const gap = integrateWattsToKwh([
            {tMs: start, watts: null},
            {tMs: start + hour, watts: null},
        ], start, start + hour);
        assert.equal(gap, null);
        const skipped = integrateWattsToKwh([
            {tMs: start, watts: 1000},
            {tMs: start + hour, watts: null},
            {tMs: start + 2 * hour, watts: 1000},
            {tMs: start + 3 * hour, watts: 1000},
        ], start, start + 3 * hour);
        assert.equal(skipped, 1);
    });

    it("does not fill empty buckets with 0", () => {
        assert.equal(averageWattsInBucket([{tMs: 10, watts: null}], 0, 100), null);
        assert.equal(averageWattsInBucket([{tMs: 10, watts: 200}], 0, 100), 200);
    });
});

describe("solar savings vs grid-only", () => {
    it("values free self-use at 0 and reports the grid-only counterfactual", () => {
        const free = tentSavings({
            tentFromSolarKwh: 8,
            tentFromGridKwh: 0.5,
            solarKwhValueEur: 0,
            gridTariffEurPerKwh: 0.32,
        });
        assert.equal(free.tentSolarEur, 0);
        assert.equal(free.tentGridEur, 0.16);
        assert.equal(free.tentTotalEur, 0.16);
        assert.equal(free.tentKwh, 8.5);
        assert.equal(free.gridOnlyEur, 2.72);
        assert.equal(free.savingsEur, 2.56);
        assert.equal(solarKwhValueEur("zero", 0.08), 0);
    });

    it("values self-use at the feed-in tariff when that mode is on", () => {
        const feed = tentSavings({
            tentFromSolarKwh: 8,
            tentFromGridKwh: 0.5,
            solarKwhValueEur: solarKwhValueEur("feed-in", 0.08),
            gridTariffEurPerKwh: 0.32,
        });
        assert.equal(feed.tentSolarEur, 0.64);
        assert.equal(feed.tentTotalEur, 0.8);
        assert.equal(feed.savingsEur, 1.92);
    });

    it("does not invent savings when a kWh input is missing", () => {
        const missing = tentSavings({
            tentFromSolarKwh: null,
            tentFromGridKwh: 0.5,
            solarKwhValueEur: 0,
            gridTariffEurPerKwh: 0.32,
        });
        assert.equal(missing.tentTotalEur, null);
        assert.equal(missing.gridOnlyEur, null);
        assert.equal(missing.savingsEur, null);
    });
});

describe("solar view This Grow sample", () => {
    it("builds a This Grow sample view instead of substituting empty 0s", () => {
        const view = buildSolarView({
            range: "grow",
            nowMs: Date.parse("2026-11-17T10:42:00.000Z"),
            timezone: TZ,
            sample: true,
            grow: GROW,
            config: {
                allocationMode: "proportional",
                batteryDischargeOrigin: "always-solar",
                solarKwhValueMode: "zero",
                feedInTariffEurPerKwh: 0.08,
                gridTariffEurPerKwh: 0.32,
            },
            liveMetrics: {},
            liveState: null,
            observedAt: null,
            stale: true,
            series: {},
        });
        assert.equal(view.range, "grow");
        assert.equal(view.sample, true);
        assert.equal(view.grow.active, true);
        assert.ok(view.buckets.length > 0);
        assert.equal(view.live.tentDevices.length, 3);
        assert.equal(view.growDisabledHint, null);
    });
});
