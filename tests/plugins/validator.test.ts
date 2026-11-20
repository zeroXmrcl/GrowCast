import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {parsePluginManifest} from "../../lib/plugins/manifest.ts";
import {validateIngestBody} from "../../lib/plugins/validator.ts";
import {SAMPLE_MANIFEST} from "./helpers.ts";

const NOW = Date.parse("2026-11-17T10:00:00.000Z");

function manifest() {
    const parsed = parsePluginManifest(SAMPLE_MANIFEST);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
        throw new Error(parsed.error);
    }
    return parsed.value;
}

describe("plugin ingest validator", () => {
    it("accepts declared finite gauges and returns 204-shaped data", () => {
        const result = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T09:59:50.000Z",
            metrics: {"pv.power": {value: 6240}, "battery.soc": {value: 71}},
        }, {pvPeakW: 11000, intervalS: 10}, {}, NOW);
        assert.equal("error" in result, false);
        if (!("error" in result)) {
            assert.equal(result.metrics["pv.power"], 6240);
            assert.equal(result.metrics["battery.soc"], 71);
        }
    });

    it("rejects an unknown metric key with 422", () => {
        const result = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T09:59:50.000Z",
            metrics: {nope: {value: 1}},
        }, {pvPeakW: 11000}, {}, NOW);
        assert.equal("error" in result, true);
        if ("error" in result) {
            assert.equal(result.status, 422);
        }
    });

    it("rejects NaN and out-of-bounds gauges", () => {
        const nan = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T09:59:50.000Z",
            metrics: {"battery.soc": {value: Number.NaN}},
        }, {}, {}, NOW);
        assert.equal("error" in nan && nan.status, 422);

        const high = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T09:59:50.000Z",
            metrics: {"pv.power": {value: 20000}},
        }, {pvPeakW: 11000}, {}, NOW);
        assert.equal("error" in high && high.status, 422);
        if ("error" in high) {
            assert.match(high.error, /above max/);
        }
    });

    it("rejects observedAt in the future", () => {
        const result = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T10:20:00.000Z",
            metrics: {"battery.soc": {value: 10}},
        }, {}, {}, NOW);
        assert.equal("error" in result && result.status, 422);
    });

    it("treats a counter drop as a reset instead of negative energy", () => {
        const result = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T09:59:50.000Z",
            metrics: {"pv.energy": {value: 100}},
        }, {}, {"pv.energy": 999999}, NOW);
        assert.equal("error" in result, false);
        if (!("error" in result)) {
            assert.equal(result.metrics["pv.energy"], 100);
        }
    });

    it("rejects secret keys anywhere in the payload", () => {
        const result = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T09:59:50.000Z",
            metrics: {"battery.soc": {value: 10}},
            state: {password: "user"},
        }, {}, {}, NOW);
        assert.equal("error" in result && result.status, 422);
    });

    it("omits missing metrics instead of substituting 0", () => {
        const result = validateIngestBody(manifest(), {
            apiVersion: 1,
            observedAt: "2026-11-17T09:59:50.000Z",
            metrics: {"pv.power": {value: 10}},
        }, {pvPeakW: 11000}, {}, NOW);
        assert.equal("error" in result, false);
        if (!("error" in result)) {
            assert.equal("battery.soc" in result.metrics, false);
            assert.equal(result.metrics["pv.power"], 10);
        }
    });
});
