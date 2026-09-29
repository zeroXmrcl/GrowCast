import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {INSTALLER_COPY, installerDoneRows} from "../app/setup/installer-copy.ts";
import {isInstallerStreamUrl} from "../app/setup/installer-url.ts";
import {passwordLineMet, passwordLineScale} from "../app/setup/password-line.ts";
import {readSkippedSteps, writeSkippedStep} from "../lib/setup-account.ts";

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

    it("marks skipped climate and keeps a saved camera url", () => {
        const rows = installerDoneRows({
            username: "admin",
            climate: null,
            streamUrl: "https://stream.example.com/growcam/",
            twitchSaved: false,
            timelapse: null,
            skipped: ["climate"],
        });
        assert.equal(rows.find((row) => row.label === "Climate")?.value, "Skipped");
        assert.equal(rows.find((row) => row.label === "Camera")?.value, "https://stream.example.com/growcam/");
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

it("rejects an rtsp address as the public watch link", () => {
    assert.equal(isInstallerStreamUrl("rtsp://camera/stream"), false);
    assert.equal(isInstallerStreamUrl("https://stream.example.com/growcam/"), true);
});

it("records a skip without dropping earlier skips", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-skip-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        await writeSkippedStep("climate");
        await writeSkippedStep("twitch");
        assert.deepEqual(await readSkippedSteps(), ["climate", "twitch"]);
        const raw = await readFile(path.join(dir, "setup", "skipped.json"), "utf8");
        assert.equal(raw.includes("camera"), false);
    } finally {
        if (previous === undefined) delete process.env.GROWCAST_DATA_DIR;
        else process.env.GROWCAST_DATA_DIR = previous;
        await rm(dir, {recursive: true, force: true});
    }
});
