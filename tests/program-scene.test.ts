import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("program scene", () => {
    it("is shared by capture and session preview", () => {
        const scene = src(path.join("components", "program-scene.tsx"));
        const capture = src(path.join("app", "overlay", "capture", "page.tsx"));
        const preview = src(path.join("app", "program", "page.tsx"));
        assert.match(scene, /OverlayHud/);
        assert.match(scene, /lockStream/);
        assert.match(scene, /ProgramAudio/);
        assert.match(scene, /OverlayAlertLayer/);
        assert.match(scene, /layout=\{overlayLayout\}/);
        assert.match(scene, /captureToken=\{captureToken\}/);
        assert.match(capture, /ProgramScene/);
        assert.match(preview, /ProgramScene/);
        assert.match(preview, /isAdminAuthenticated/);
        assert.doesNotMatch(preview, /token/);
        assert.match(capture, /isRestreamCaptureAuthorized/);
    });

    it("keeps OverlayAlertLayer a HUD sibling and wires program alert SSE", () => {
        const scene = src(path.join("components", "program-scene.tsx"));
        const layer = src(path.join("components", "overlay-alert-layer.tsx"));
        const route = src(path.join("app", "api", "overlay", "program-alerts", "route.ts"));
        const http = src(path.join("lib", "overlay-alert-http.ts"));
        const hub = src(path.join("lib", "overlay-alert-hub.ts"));

        assert.match(scene, /<OverlayHud[\s\S]*\/>\s*<OverlayAlertLayer layout=\{overlayLayout\} captureToken=\{captureToken\} \/>/);
        assert.match(layer, /"use client"/);
        assert.match(layer, /EventSource/);
        assert.match(layer, /\/api\/overlay\/program-alerts/);
        assert.match(layer, /\?token=/);
        assert.match(layer, /enqueueOverlayAlert/);
        assert.match(layer, /OVERLAY_ALERT_DISPLAY_MS/);
        assert.match(layer, /alertPlacement/);
        assert.match(layer, /alertToastCopy/);
        assert.match(layer, /overlayAlertScaleStyle/);
        assert.match(layer, /\/api\/overlay\/program-audio/);
        assert.match(layer, /x-growcast-capture/);
        assert.match(layer, /alertScalePct/);
        assert.match(layer, /pointer-events-none/);
        assert.match(layer, /absolute z-20 top-8 right-8/);
        assert.match(layer, /absolute z-20 top-8 left-8/);
        assert.match(layer, /max-w-\[28rem\]/);
        assert.match(layer, /min-w-\[340px\]/);
        assert.match(layer, /#22c55e/);
        assert.doesNotMatch(layer, /OVERLAY_PANEL_CLASS/);
        assert.doesNotMatch(layer, /bottom-8 right-8/);
        assert.doesNotMatch(layer, /left-1\/2/);
        assert.match(route, /isAdminAuthenticated/);
        assert.match(route, /programAlertsSseResponse/);
        assert.doesNotMatch(http, /isAdminAuthenticated/);
        assert.doesNotMatch(http, /next\/headers/);
        assert.match(http, /text\/event-stream/);
        assert.match(http, /no-store/);
        assert.match(http, /: heartbeat/);
        assert.match(hub, /__growcastOverlayAlertHub/);
        assert.match(hub, /enqueueOverlayAlert/);
        assert.match(hub, /globalThis/);
    });

    it("dispatches growcast-alert-sting so ProgramAudio can duck", () => {
        const layer = src(path.join("components", "overlay-alert-layer.tsx"));
        const audio = src(path.join("components", "program-audio.tsx"));
        assert.match(layer, /new CustomEvent\("growcast-alert-sting"\)/);
        assert.match(layer, /dispatchEvent/);
        assert.match(audio, /growcast-alert-sting/);
        assert.match(audio, /addEventListener/);
        assert.match(audio, /stingEnabled/);
        assert.match(audio, /0\.25/);
        assert.match(audio, /1500/);
        assert.match(audio, /clearTimeout/);
    });
});
