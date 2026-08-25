import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {normalizeGrowRecord} from "../lib/db.ts";
import {
    DEFAULT_OVERLAY_SCALE_PCT,
    OVERLAY_SCALE_MAX,
    OVERLAY_SCALE_MIN,
    OVERLAY_SCALE_STEP,
    overlayHudScaleStyle,
    parseOverlayScalePct,
} from "../lib/overlay-scale.ts";

describe("parseOverlayScalePct", () => {
    it("defaults missing and junk to 100", () => {
        assert.equal(DEFAULT_OVERLAY_SCALE_PCT, 100);
        assert.equal(OVERLAY_SCALE_MIN, 50);
        assert.equal(OVERLAY_SCALE_MAX, 200);
        assert.equal(OVERLAY_SCALE_STEP, 5);
        assert.equal(parseOverlayScalePct(undefined), 100);
        assert.equal(parseOverlayScalePct(null), 100);
        assert.equal(parseOverlayScalePct(""), 100);
        assert.equal(parseOverlayScalePct("nope"), 100);
        assert.equal(parseOverlayScalePct(Number.NaN), 100);
    });

    it("clamps to 50–200 and snaps to 5%", () => {
        assert.equal(parseOverlayScalePct(50), 50);
        assert.equal(parseOverlayScalePct(200), 200);
        assert.equal(parseOverlayScalePct(100), 100);
        assert.equal(parseOverlayScalePct("75"), 75);
        assert.equal(parseOverlayScalePct(77), 75);
        assert.equal(parseOverlayScalePct(78), 80);
        assert.equal(parseOverlayScalePct(49), 50);
        assert.equal(parseOverlayScalePct(201), 200);
    });
});

describe("overlayHudScaleStyle", () => {
    it("scales from the rail or bar origin and uses none at 100%", () => {
        assert.deepEqual(overlayHudScaleStyle(100, "left-rail"), {
            transform: "none",
            transformOrigin: "top left",
        });
        assert.deepEqual(overlayHudScaleStyle(75, "left-rail"), {
            transform: "scale(0.75)",
            transformOrigin: "top left",
        });
        assert.deepEqual(overlayHudScaleStyle(125, "bottom-bar"), {
            transform: "scale(1.25)",
            transformOrigin: "bottom left",
        });
    });
});

describe("normalizeGrowRecord overlayScalePct", () => {
    it("fills missing overlayScalePct with 100 and rejects junk", () => {
        assert.equal(normalizeGrowRecord({name: "Only Name"}).overlayScalePct, 100);
        assert.equal(normalizeGrowRecord({overlayScalePct: 150}).overlayScalePct, 150);
        assert.equal(normalizeGrowRecord({overlayScalePct: 77}).overlayScalePct, 75);
        assert.equal(normalizeGrowRecord({overlayScalePct: "wide"}).overlayScalePct, 100);
    });
});
