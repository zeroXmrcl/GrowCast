import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    DEFAULT_OVERLAY_LAYOUT,
    overlayPublicUrl,
    parseOverlayLayout,
} from "../lib/overlay-layout.ts";
import {normalizeGrowRecord} from "../lib/db.ts";

describe("parseOverlayLayout", () => {
    it("defaults missing and junk to left-rail", () => {
        assert.equal(DEFAULT_OVERLAY_LAYOUT, "left-rail");
        assert.equal(parseOverlayLayout(undefined), "left-rail");
        assert.equal(parseOverlayLayout(null), "left-rail");
        assert.equal(parseOverlayLayout(""), "left-rail");
        assert.equal(parseOverlayLayout("left-rail"), "left-rail");
        assert.equal(parseOverlayLayout("nope"), "left-rail");
        assert.equal(parseOverlayLayout(1), "left-rail");
    });

    it("round-trips bottom-bar", () => {
        assert.equal(parseOverlayLayout("bottom-bar"), "bottom-bar");
    });
});

describe("normalizeGrowRecord overlayLayout", () => {
    it("fills missing overlayLayout with left-rail", () => {
        const grow = normalizeGrowRecord({name: "Only Name"});
        assert.equal(grow.overlayLayout, "left-rail");
    });

    it("keeps bottom-bar and rejects junk", () => {
        assert.equal(
            normalizeGrowRecord({overlayLayout: "bottom-bar"}).overlayLayout,
            "bottom-bar",
        );
        assert.equal(normalizeGrowRecord({overlayLayout: "rail"}).overlayLayout, "left-rail");
    });
});

describe("overlayPublicUrl", () => {
    it("joins /overlay onto the public origin", () => {
        assert.equal(
            overlayPublicUrl("https://grow.0xmarcel.com"),
            "https://grow.0xmarcel.com/overlay",
        );
        assert.equal(
            overlayPublicUrl("https://grow.0xmarcel.com/"),
            "https://grow.0xmarcel.com/overlay",
        );
    });
});
