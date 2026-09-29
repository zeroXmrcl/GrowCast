import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {INSTALLER_COPY, installerDoneRows} from "../app/setup/installer-copy.ts";
import {isSafeHttpUrl} from "../lib/url-policy.ts";
import {adminSetupDecision, installerCanFinish} from "../lib/installer-ready.ts";
import {isRtspUrl} from "../lib/timelapse-sidecar-env.ts";
import {passwordLineMet, passwordLineScale} from "../app/setup/password-meter.ts";
import {parseSetupCodePaste, setupCodeSlots} from "../lib/setup-code.ts";
import {readSkippedSteps, writeSkippedStep} from "../lib/setup-account.ts";

describe("installer copy", () => {
    it("locks the approved lines", () => {
        assert.equal(INSTALLER_COPY.authenticate.label, "Authenticate");
        assert.equal(
            INSTALLER_COPY.authenticate.line,
            "It is printed in the GrowCast log when the container starts.",
        );
        assert.equal(INSTALLER_COPY.admin.line, "The password needs 12 characters.");
        assert.equal(
            INSTALLER_COPY.climate.line,
            "Email and password only. Google or Apple sign-in will not work.",
        );
        assert.equal(
            INSTALLER_COPY.camera.line,
            "Paste the MediaMTX HLS source, like http://stream.example.com/growcam/.",
        );
        assert.equal(INSTALLER_COPY.twitch.line, "Creator Dashboard -> Settings -> Stream.");
        assert.equal(INSTALLER_COPY.timelapse.line, "Use the camera’s local rtsp:// address.");
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

describe("setup code slots", () => {
    it("keeps the four-and-four shape from a paste or a log line", () => {
        assert.equal(parseSetupCodePaste("o1il-0ne2"), "o1il0ne2");
        assert.equal(parseSetupCodePaste("4hbk-kuv6"), "4hbkkuv6");
        assert.equal(parseSetupCodePaste("Setup code  4hbk-kuv6"), "4hbkkuv6");
        assert.deepEqual(setupCodeSlots("4hbk-kuv6"), ["4", "h", "b", "k", "k", "u", "v", "6"]);
        assert.deepEqual(setupCodeSlots("4hb"), ["4", "h", "b", "", "", "", "", ""]);
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
    assert.equal(isSafeHttpUrl("rtsp://camera/stream"), false);
    assert.equal(isSafeHttpUrl("https://stream.example.com/growcam/"), true);
});

it("keeps a lan camera and rejects this server as the timelapse source", () => {
    assert.equal(isRtspUrl("rtsp://user:secret@10.0.0.8:554/stream"), true);
    assert.equal(isRtspUrl("rtsp://192.168.1.20:554/stream"), true);
    assert.equal(isRtspUrl("rtsp://127.0.0.1/stream"), false);
    assert.equal(isRtspUrl("rtsp://growcast:3000/x"), false);
    assert.equal(isRtspUrl("rtsp://169.254.169.254/"), false);
});

it("signs back into an existing admin and will not replace it", () => {
    assert.equal(adminSetupDecision(null, "ada"), "create");
    assert.equal(adminSetupDecision("ada", "ada"), "sign-in");
    assert.equal(adminSetupDecision("ada", "mallory"), "reject");
});

it("finishes only after every step is saved or skipped", () => {
    const empty = {
        hasAdmin: true,
        skipped: [] as string[],
        climateConfigured: false,
        streamUrl: "",
        hasTwitchKey: false,
        rtsp: "",
    };
    assert.equal(installerCanFinish({...empty, hasAdmin: false}).ok, false);
    assert.match(installerCanFinish(empty).message ?? "", /Climate/);
    assert.equal(installerCanFinish({
        ...empty,
        skipped: ["climate", "camera", "twitch", "timelapse"],
    }).ok, true);
    assert.equal(installerCanFinish({
        hasAdmin: true,
        skipped: [],
        climateConfigured: true,
        streamUrl: "https://stream.example.com/growcam/",
        hasTwitchKey: true,
        rtsp: "rtsp://10.0.0.8:554/stream",
    }).ok, true);
    assert.match(installerCanFinish({
        hasAdmin: true,
        skipped: ["climate", "camera", "twitch"],
        climateConfigured: false,
        streamUrl: "",
        hasTwitchKey: false,
        rtsp: "rtsp://growcast:3000/x",
    }).message ?? "", /Timelapse/);
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
