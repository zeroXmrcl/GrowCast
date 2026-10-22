import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {localClimatePreviewEnabled, climatePreviewHistory, climatePreviewSnapshot} from "../lib/climate/local-preview.ts";
import {layoutStepRuns} from "../lib/climate/plot.ts";
import {parsePublicLiveBody} from "../lib/ggs-live.ts";
import {shouldShowLiveRow} from "../lib/live-climate-view.ts";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");

describe("climate local preview", () => {
    it("is on for the dev server and an explicit flag, off for test and production", () => {
        assert.equal(localClimatePreviewEnabled({NODE_ENV: "development"}), true);
        assert.equal(localClimatePreviewEnabled({GROWCAST_ENV: "dev", NODE_ENV: "production"}), true);
        assert.equal(localClimatePreviewEnabled({NODE_ENV: "test"}), false);
        assert.equal(localClimatePreviewEnabled({NODE_ENV: "production"}), false);
        assert.equal(localClimatePreviewEnabled({GROWCAST_ENV: "prod", NODE_ENV: "development"}), false);
        assert.equal(localClimatePreviewEnabled({GROWCAST_CLIMATE_PREVIEW: "1", NODE_ENV: "production"}), true);
        assert.equal(localClimatePreviewEnabled({GROWCAST_CLIMATE_PREVIEW: "0", NODE_ENV: "development"}), false);
    });

    it("publishes a public snapshot the climate card can mount", () => {
        const snapshot = climatePreviewSnapshot(NOW);
        const parsed = parsePublicLiveBody(snapshot);
        assert.equal(parsed.ok, true);
        if (!parsed.ok) {
            return;
        }
        assert.equal(shouldShowLiveRow(parsed.value), true);
        assert.equal(parsed.value.devices[0].sensor.tempC, 25.4);
        assert.equal(parsed.value.devices[0].sensor.humidityPct, 62.8);
        assert.equal("serial" in parsed.value.devices[0], false);
    });

    it("builds four ranges that do not share one line", () => {
        const history = climatePreviewHistory(NOW, "2001-01-01");
        for (const key of ["24h", "7d", "30d", "grow"] as const) {
            const window = history[key];
            assert.ok(window, key);
            assert.ok(window.runs.some((run) => run.length >= 2), key);
        }
        const last = history["24h"].runs.at(-1)?.at(-1);
        assert.equal(last?.tempC, 25.4);
        assert.equal(last?.humidityPct, 62.8);
        assert.ok(history["7d"].runs.length >= 2);
        assert.ok(history["30d"].runs.length >= 2);

        const week = layoutStepRuns(
            history["7d"].runs.map((run) => run.map((point) => ({t: point.t, value: point.tempC}))),
            600,
            160,
        );
        const month = layoutStepRuns(
            history["30d"].runs.map((run) => run.map((point) => ({t: point.t, value: point.tempC}))),
            600,
            160,
        );
        const weekY = week[0]?.segments[0]?.y;
        const monthY = month[0]?.segments[0]?.y;
        assert.ok(weekY !== undefined && monthY !== undefined);
        assert.ok(Math.abs(weekY - monthY) > 4);
    });
});
