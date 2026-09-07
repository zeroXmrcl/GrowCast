import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    alertPlacement,
    enqueueOverlayAlert,
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
