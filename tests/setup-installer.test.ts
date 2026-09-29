import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {INSTALLER_COPY} from "../app/setup/installer-copy.ts";
import {passwordLineMet, passwordLineScale} from "../app/setup/password-line.ts";

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

describe("password line", () => {
    it("fills the admin password line across 12 characters", () => {
        assert.equal(passwordLineScale(""), 0);
        assert.equal(passwordLineScale("123456"), 0.5);
        assert.equal(passwordLineScale("123456789012"), 1);
        assert.equal(passwordLineScale("123456789012345"), 1);
        assert.equal(passwordLineMet("12345678901"), false);
        assert.equal(passwordLineMet("123456789012"), true);
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

it("uses the admin rail ease for installer motion", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
    assert.match(css, /\.installer-copy\.leave[\s\S]*cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});
