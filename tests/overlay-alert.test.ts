import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    OVERLAY_ALERT_DISPLAY_MS,
    alertPlacement,
    alertToastCopy,
    enqueueOverlayAlert,
    replayableOverlayAlerts,
    type OverlayAlert,
} from "../lib/overlay-alert.ts";

function alert(id: string): OverlayAlert {
    return {id, kind: "manual", title: "Alert", body: id, createdAt: 0};
}

describe("alertPlacement", () => {
    it("puts alerts opposite the HUD", () => {
        assert.equal(alertPlacement("left-rail"), "bottom-right");
        assert.equal(alertPlacement("bottom-bar"), "top-center");
    });
});

describe("enqueueOverlayAlert", () => {
    it("is FIFO, one display at a time, cap 15 drops oldest", () => {
        let q: OverlayAlert[] = [];
        q = enqueueOverlayAlert(q, alert("a"));
        q = enqueueOverlayAlert(q, alert("b"));
        assert.deepEqual(q.map((x) => x.id), ["a", "b"]);
        for (let i = 0; i < 20; i++) {
            q = enqueueOverlayAlert(q, alert(`n${i}`));
        }
        assert.equal(q.length, 15);
        assert.equal(q[0].id, "n5");
        assert.equal(q[14].id, "n19");
    });

    it("does not enqueue empty manual body", () => {
        const q = enqueueOverlayAlert([], {
            id: "x",
            kind: "manual",
            title: "",
            body: "   ",
            createdAt: 1,
        });
        assert.deepEqual(q, []);
    });
});

describe("alertToastCopy", () => {
    it("uses kind for the chip and body for the headline", () => {
        assert.deepEqual(
            alertToastCopy({
                id: "1",
                kind: "follow",
                title: "Follow",
                body: "marcel",
                createdAt: 1,
            }),
            {chip: "Follow", headline: "marcel"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "2",
                kind: "sub",
                title: "Sub",
                body: "ada",
                createdAt: 1,
            }),
            {chip: "Sub", headline: "ada"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "3",
                kind: "raid",
                title: "Raid",
                body: "Ada · 12",
                createdAt: 1,
            }),
            {chip: "Raid", headline: "Ada · 12"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "4",
                kind: "bits",
                title: "Bits",
                body: "Ada 100",
                createdAt: 1,
            }),
            {chip: "Bits", headline: "Ada 100"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "5",
                kind: "manual",
                title: "Alert",
                body: "Lights just came on",
                createdAt: 1,
            }),
            {chip: "Alert", headline: "Lights just came on"},
        );
    });
});

describe("replayableOverlayAlerts", () => {
    it("keeps only alerts still within the display window", () => {
        const fresh = alert("fresh");
        fresh.createdAt = 10_000;
        const stale = alert("stale");
        stale.createdAt = 1000;
        const now = 10_000 + OVERLAY_ALERT_DISPLAY_MS - 1;
        assert.deepEqual(
            replayableOverlayAlerts([stale, fresh], now).map((entry) => entry.id),
            ["fresh"],
        );
    });
});
