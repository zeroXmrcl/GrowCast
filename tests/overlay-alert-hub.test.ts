import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {enqueueOverlayAlert, type OverlayAlert} from "../lib/overlay-alert.ts";
import {
    _resetOverlayAlertHubForTests,
    peekOverlayAlertQueue,
    publishOverlayAlert,
    takeNextOverlayAlert,
} from "../lib/overlay-alert-hub.ts";
import {parseAlertsSettings} from "../lib/restream/alerts-settings.ts";

describe("overlay alert hub", () => {
    it("publishes FIFO and takeNext pops the current head", () => {
        _resetOverlayAlertHubForTests();
        const a: OverlayAlert = {id: "1", kind: "follow", title: "Follow", body: "x", createdAt: 1};
        const b: OverlayAlert = {id: "2", kind: "sub", title: "Sub", body: "y", createdAt: 2};
        publishOverlayAlert(a);
        publishOverlayAlert(b);
        assert.equal(peekOverlayAlertQueue().length, 2);
        assert.equal(takeNextOverlayAlert()?.id, "1");
        assert.equal(peekOverlayAlertQueue()[0].id, "2");
    });

    it("drops oldest at cap 15", () => {
        _resetOverlayAlertHubForTests();
        for (let i = 0; i < 16; i++) {
            publishOverlayAlert({
                id: String(i),
                kind: "bits",
                title: "Bits",
                body: String(i),
                createdAt: i,
            });
        }
        assert.equal(peekOverlayAlertQueue().length, 15);
        assert.equal(peekOverlayAlertQueue()[0].id, "1");
    });

    it("does not enqueue a follow when follow is off; manual still enqueues", () => {
        _resetOverlayAlertHubForTests();
        const settings = parseAlertsSettings({follow: false});
        publishOverlayAlert(
            {id: "1", kind: "follow", title: "Follow", body: "x", createdAt: 1},
            settings,
        );
        assert.equal(peekOverlayAlertQueue().length, 0);
        publishOverlayAlert(
            {id: "2", kind: "manual", title: "Alert", body: "y", createdAt: 2},
            settings,
        );
        assert.equal(peekOverlayAlertQueue().length, 1);
        assert.equal(peekOverlayAlertQueue()[0].id, "2");
    });
});
