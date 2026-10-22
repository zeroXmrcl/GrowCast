import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {describe, it} from "node:test";
import {layoutStepAxis, layoutStepRuns, morphStepFrame, pairStepPieces, stepPath} from "../lib/climate/plot.ts";
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
        assert.match(dialog, /translateY/);
        assert.match(dialog, /transition: shown/);
        assert.match(dialog, /24 hours/);
        assert.match(dialog, /ArrowLeft/);
        assert.match(dialog, /Show \$\{previous.label\}/);
        assert.doesNotMatch(dialog, /Past climate/);
        const chart = src("components/climate-history-chart.tsx");
        assert.match(chart, /morphStepFrame/);
        assert.match(chart, /pairStepPieces/);
        assert.doesNotMatch(css, /translateY\(-2px\)/);
        assert.match(css, /growcast-climate-history-trigger/);
        assert.match(css, /growcast-history-swap/);
        assert.match(css, /prefers-reduced-motion: reduce/);
        assert.match(css, /cursor: pointer/);
        assert.match(css, /:focus-visible/);
    });

    it("moves the line already on screen into the next range", () => {
        const from = layoutStepRuns([[
            {t: "2026-10-19T00:00:00.000Z", value: 10},
            {t: "2026-10-19T02:00:00.000Z", value: 20},
        ]], 200, 100);
        const to = layoutStepRuns([[
            {t: "2026-10-19T00:00:00.000Z", value: 30},
            {t: "2026-10-19T02:00:00.000Z", value: 0},
        ]], 200, 100);
        const pieces = pairStepPieces(from, to, 200);
        const start = morphStepFrame(pieces, 0, 100);
        const mid = morphStepFrame(pieces, 0.5, 100);
        const end = morphStepFrame(pieces, 1, 100);
        assert.match(start.shared.d, new RegExp(from[0].segments[0].y.toFixed(2)));
        assert.match(end.shared.d, new RegExp(to[0].segments[0].y.toFixed(2)));
        assert.match(mid.shared.d, new RegExp(((from[0].segments[0].y + to[0].segments[0].y) / 2).toFixed(2)));
        assert.notEqual(start.shared.d, end.shared.d);

        const gapped = layoutStepRuns([
            [{t: "2026-10-19T00:00:00.000Z", value: 10}],
            [{t: "2026-10-19T06:00:00.000Z", value: 20}],
        ], 300, 80);
        const filled = layoutStepRuns([[
            {t: "2026-10-19T00:00:00.000Z", value: 10},
            {t: "2026-10-19T03:00:00.000Z", value: 16},
            {t: "2026-10-19T06:00:00.000Z", value: 20},
        ]], 300, 80);
        const gapPieces = pairStepPieces(gapped, filled, 300);
        assert.equal(gapPieces.some((piece) => piece.a == null && piece.b != null), true);
        const gapFrame = morphStepFrame(gapPieces, 0, 80);
        assert.equal(gapFrame.fadeIn.opacity, 0);
        assert.notEqual(gapFrame.fadeIn.d, "");
        assert.equal(morphStepFrame(gapPieces, 1, 80).fadeOut.opacity, 0);
    });

    it("does not import this branch storage ClimatePoint from types", () => {
        const dialog = src("components/climate-history-dialog.tsx");
        assert.match(dialog, /@\/lib\/climate\/history-public/);
        assert.match(dialog, /@\/lib\/climate\/plot/);
        assert.doesNotMatch(dialog, /@\/lib\/climate\/types/);
        assert.doesNotMatch(dialog, /XAI_API_KEY|requestGrowSummary/);
    });
});
