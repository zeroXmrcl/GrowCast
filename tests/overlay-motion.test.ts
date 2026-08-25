import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {
    OVERLAY_CHIP_COLOR_MS,
    OVERLAY_EASING_ENTER,
    OVERLAY_EASING_LEAVE,
    OVERLAY_ENTER_MS,
    OVERLAY_LEAVE_MS,
    OVERLAY_LIVE_PULSE_MS,
    OVERLAY_ORDER_CLIMATE,
    OVERLAY_ORDER_ENERGY,
    OVERLAY_ORDER_GEAR,
    OVERLAY_ORDER_IDENTITY,
    OVERLAY_SLIDE_PX,
    OVERLAY_STAGGER_MS,
    overlaySlideTransform,
    overlayStaggerMs,
} from "../lib/overlay-motion.ts";

describe("overlay motion tokens", () => {
    it("exports the locked durations, slide, easing, and stagger order", () => {
        assert.equal(OVERLAY_ENTER_MS, 220);
        assert.equal(OVERLAY_LEAVE_MS, 160);
        assert.equal(OVERLAY_STAGGER_MS, 40);
        assert.equal(OVERLAY_SLIDE_PX, 10);
        assert.equal(OVERLAY_EASING_ENTER, "cubic-bezier(0.16, 1, 0.3, 1)");
        assert.equal(OVERLAY_EASING_LEAVE, "cubic-bezier(0.4, 0, 1, 1)");
        assert.equal(OVERLAY_CHIP_COLOR_MS, 150);
        assert.equal(OVERLAY_LIVE_PULSE_MS, 2000);
        assert.deepEqual(
            [
                OVERLAY_ORDER_IDENTITY,
                OVERLAY_ORDER_CLIMATE,
                OVERLAY_ORDER_GEAR,
                OVERLAY_ORDER_ENERGY,
            ],
            [0, 1, 2, 3],
        );
    });

    it("drops stagger and slide when reduced motion is set", () => {
        assert.equal(overlayStaggerMs(OVERLAY_ORDER_ENERGY, false), 120);
        assert.equal(overlayStaggerMs(OVERLAY_ORDER_ENERGY, true), 0);
        assert.equal(overlaySlideTransform("left-rail", true), "none");
        assert.equal(overlaySlideTransform("bottom-bar", true), "none");
        assert.equal(overlaySlideTransform("left-rail", false), "translateX(-10px)");
        assert.equal(overlaySlideTransform("bottom-bar", false), "translateY(10px)");
    });
});

describe("overlay components import motion tokens", () => {
    it("does not hardcode the motion values in overlay JSX", () => {
        const files = [
            "overlay-motion-item.tsx",
            "overlay-gear.tsx",
            "overlay-hud.tsx",
        ];
        for (const file of files) {
            const src = readFileSync(
                path.join(process.cwd(), "components", file),
                "utf8",
            );
            assert.match(src, /from ["']@\/lib\/overlay-motion["']/);
            assert.doesNotMatch(src, /cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
            assert.doesNotMatch(src, /220ms/);
        }
    });

    it("collapses the 0fr inner wrapper on both axes and reads reduced motion before paint", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components", "overlay-motion-item.tsx"),
            "utf8",
        );
        assert.match(src, /className="min-h-0 min-w-0 overflow-hidden"/);
        assert.match(src, /useSyncExternalStore/);
        assert.match(src, /getReducedMotionSnapshot/);
        assert.doesNotMatch(src, /setReduced/);
    });
});
