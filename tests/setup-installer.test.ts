import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {INSTALLER_COPY} from "../app/setup/installer-copy.ts";

describe("installer copy", () => {
    it("locks the approved lines", () => {
        assert.equal(INSTALLER_COPY.admin.line, "The password needs 12 characters.");
        assert.equal(
            INSTALLER_COPY.climate.line,
            "Email and password only. Google or Apple sign-in will not work.",
        );
        assert.equal(
            INSTALLER_COPY.camera.line,
            "Something like http://stream.example.com/growcam/. Not the rtsp:// address from the camera.",
        );
        assert.equal(INSTALLER_COPY.twitch.line, "Creator Dashboard -> Settings -> Stream.");
        assert.equal(INSTALLER_COPY.timelapse.line, "Use the camera’s rtsp:// address.");
        assert.equal(INSTALLER_COPY.done.line, "You can change any of this later in admin settings.");
    });
});

describe("installer rail", () => {
    it("styles a finished step with a number, grey fill, and white border", () => {
        const src = readFileSync(path.join(process.cwd(), "app", "setup", "installer-rail.tsx"), "utf8");
        assert.match(src, /installer-step-done/);
        assert.match(src, /#3a3a3a/);
        assert.match(src, /#f3f4f6/);
        assert.doesNotMatch(src, /✓|checkmark|#3d9a33/);
    });
});
