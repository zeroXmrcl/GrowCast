import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {describe, it} from "node:test";
import {layoutStepAxis, stepPath} from "../lib/climate/plot.ts";
import {
    CLIMATE_HISTORY_METRIC_CHIPS,
    CLIMATE_HISTORY_METRICS,
    climateHistoryOpenLabel,
} from "../lib/climate/history-ui.ts";

function src(rel: string): string {
    return readFileSync(rel, "utf8");
}

describe("climate history dialog", () => {
    it("draws a step between two values", () => {
        const path = stepPath([0, 10], 100, 20);
        assert.match(path, /^M0 /);
        assert.match(path, /H50/);
        assert.match(path, /H100/);
    });

    it("places each axis label on the time it names", () => {
        const width = 300;
        const labels = layoutStepAxis([
            [{t: "2026-10-11T00:00:00.000Z", value: 20}],
            [{t: "2026-10-13T00:00:00.000Z", value: 22}],
        ], width, 160);
        assert.equal(labels[0].x, 0);
        assert.equal(labels[1].t, "2026-10-12T00:00:00.000Z");
        assert.notEqual(labels[1].t, labels[0].t);
        assert.equal(labels[1].x, width / 3);
        assert.equal(labels[2].t, "2026-10-13T00:00:00.000Z");
        assert.equal(labels[2].x, (2 * width) / 3);
    });

    it("names each card value as a history trigger", () => {
        assert.deepEqual([...CLIMATE_HISTORY_METRICS], ["tempC", "humidityPct", "vpd"]);
        assert.equal(climateHistoryOpenLabel("tempC"), "Open temperature history");
        assert.equal(climateHistoryOpenLabel("humidityPct"), "Open humidity history");
        assert.equal(climateHistoryOpenLabel("vpd"), "Open VPD history");
        assert.deepEqual(CLIMATE_HISTORY_METRIC_CHIPS.map((chip) => chip.key), ["tempC", "humidityPct", "vpd"]);
    });

    it("opens from the three climate values and drops the History chip", () => {
        const card = src("components/live-climate-card.tsx");
        const row = src("components/live-tent-row.tsx");
        const dialog = src("components/climate-history-dialog.tsx");
        assert.match(card, /aria-label=\{climateHistoryOpenLabel\(metric\)\}/);
        assert.match(card, /climateHistoryOpenLabel/);
        assert.match(card, /growcast-climate-history-trigger/);
        assert.match(card, /aria-haspopup="dialog"/);
        assert.match(card, /type="button"/);
        assert.doesNotMatch(card, />History</);
        assert.doesNotMatch(card, /HISTORY_CHIP/);
        assert.match(row, /onOpenHistory=\{openHistory\}/);
        assert.match(row, /historyMetric=\{historyMetric\}/);
        assert.match(row, /metric=\{historyMetric\}/);
        assert.match(row, /onMetricChange=\{setHistoryMetric\}/);
        assert.match(row, /trigger\.focus\(\)/);
        assert.doesNotMatch(row, /createPortal/);
        assert.doesNotMatch(row, /growcast-board/);
        assert.match(dialog, /metric:/);
        assert.match(dialog, /onMetricChange/);
        assert.match(dialog, /data-climate-history-metric/);
    });

    it("portals a fixed viewport dialog with a backdrop", () => {
        const dialog = src("components/climate-history-dialog.tsx");
        const css = src("app/globals.css");
        assert.match(dialog, /createPortal/);
        assert.match(dialog, /document\.body/);
        assert.match(dialog, /fixed inset-0/);
        assert.doesNotMatch(dialog, /absolute inset-0 z-30/);
        assert.match(dialog, /body\.style\.overflow = "hidden"/);
        assert.match(dialog, /html\.style\.overflow = "hidden"/);
        assert.match(dialog, /Escape/);
        assert.match(dialog, /focusin/);
        assert.match(dialog, /tabIndex=\{-1\}/);
        assert.match(dialog, /100dvh/);
        assert.match(dialog, /100vw/);
        assert.match(dialog, /overflow-y-auto/);
        assert.match(dialog, /prefers-reduced-motion/);
        assert.match(dialog, /scale: "1"/);
        assert.match(dialog, /transition: shown/);
        assert.match(css, /growcast-climate-history-trigger/);
        assert.match(css, /growcast-history-swap/);
        assert.match(css, /prefers-reduced-motion: reduce/);
        assert.match(css, /cursor: pointer/);
        assert.match(css, /:focus-visible/);
    });

    it("does not import this branch storage ClimatePoint from types", () => {
        const dialog = src("components/climate-history-dialog.tsx");
        assert.match(dialog, /@\/lib\/climate\/history-public/);
        assert.match(dialog, /@\/lib\/climate\/plot/);
        assert.doesNotMatch(dialog, /@\/lib\/climate\/types/);
        assert.doesNotMatch(dialog, /XAI_API_KEY|requestGrowSummary/);
    });
});
