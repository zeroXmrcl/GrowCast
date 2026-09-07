import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {applyProgramAlert} from "../lib/admin/apply-program-alert.ts";
import {
    _resetOverlayAlertHubForTests,
    peekOverlayAlertQueue,
} from "../lib/overlay-alert-hub.ts";

describe("applyProgramAlert", () => {
    it("publishes a trimmed body and rejects empty text", async () => {
        _resetOverlayAlertHubForTests();
        assert.deepEqual(await applyProgramAlert("   "), {ok: false, reason: "empty"});
        assert.equal(peekOverlayAlertQueue().length, 0);
        assert.deepEqual(await applyProgramAlert("  lights on  "), {ok: true});
        assert.equal(peekOverlayAlertQueue().length, 1);
        assert.equal(peekOverlayAlertQueue()[0].body, "lights on");
        assert.equal(peekOverlayAlertQueue()[0].kind, "manual");
    });
});

describe("program alert HTTP", () => {
    it("replays visible alerts on SSE connect and sends alerts without a page redirect", () => {
        const sse = readFileSync(
            path.join(process.cwd(), "lib", "overlay-alert-http.ts"),
            "utf8",
        );
        const route = readFileSync(
            path.join(process.cwd(), "app", "api", "admin", "program-alert", "route.ts"),
            "utf8",
        );
        assert.match(sse, /peekReplayableOverlayAlerts/);
        assert.match(route, /isSameOriginRequest/);
        assert.match(route, /isAdminAuthenticated/);
        assert.match(route, /applyProgramAlert/);
        assert.doesNotMatch(route, /seeOther/);
        assert.doesNotMatch(route, /redirect\(/);
    });
});
