import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {stat} from "node:fs/promises";
import {
    EMPTY_RESTREAM_STATUS,
    displayRestreamStatus,
    hasRestreamKey,
    parseRestreamControl,
    parseRestreamStatus,
    readRestreamControl,
    readRestreamPublicView,
    readRestreamStatus,
    redactRestreamError,
    saveRestreamKey,
    setRestreamEnabled,
} from "../lib/restream/store.ts";
import {
    captureStreamUrl,
    getRestreamTokenFromEnv,
    isRestreamCaptureAuthorized,
} from "../lib/restream/capture.ts";
import {mergeOverlayGrowPoll} from "../lib/overlay-grow.ts";
import {navItemsFor, type NavFlags} from "../lib/site-nav.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-restream-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("restream control parse", () => {
    it("defaults missing control to disabled", () => {
        assert.deepEqual(parseRestreamControl(null), {enabled: false});
        assert.deepEqual(parseRestreamControl({enabled: true}), {enabled: true});
        assert.deepEqual(parseRestreamControl({enabled: "yes"}), {enabled: false});
    });

    it("parses sidecar status states", () => {
        assert.deepEqual(parseRestreamStatus(null), EMPTY_RESTREAM_STATUS);
        assert.equal(parseRestreamStatus({state: "live", updatedAt: "t", lastError: ""}).state, "live");
        assert.equal(parseRestreamStatus({state: "nope"}).state, "off");
    });
});

describe("restream secret files", () => {
    it("stores the key off the public grow JSON and does not echo it", async () => {
        await withTempDataDir(async (dir) => {
            assert.equal(await hasRestreamKey(), false);
            await saveRestreamKey("live_xxxxxxxx");
            assert.equal(await hasRestreamKey(), true);
            const view = await readRestreamPublicView();
            assert.equal(view.hasKey, true);
            assert.equal("key" in view, false);
            const onDisk = await readFile(path.join(dir, "restream", "twitch.key"), "utf8");
            assert.equal(onDisk.trim(), "live_xxxxxxxx");
            await saveRestreamKey("   ");
            assert.equal(await hasRestreamKey(), true);
            assert.equal(
                (await readFile(path.join(dir, "restream", "twitch.key"), "utf8")).trim(),
                "live_xxxxxxxx",
            );
            const mode = (await stat(path.join(dir, "restream", "twitch.key"))).mode & 0o777;
            if (process.platform !== "win32") {
                assert.equal(mode, 0o600);
            }
        });
    });

    it("toggles enabled without touching the key", async () => {
        await withTempDataDir(async () => {
            await saveRestreamKey("live_key");
            await setRestreamEnabled(true);
            assert.equal((await readRestreamControl()).enabled, true);
            await setRestreamEnabled(false);
            assert.equal((await readRestreamControl()).enabled, false);
            assert.equal(await hasRestreamKey(), true);
            assert.equal((await readRestreamStatus()).state, "off");
        });
    });
});

describe("restream error redaction and display status", () => {
    it("strips rtmp ingest URLs and the stream key from encoder stderr", () => {
        const key = "live_secret_key_value";
        const raw =
            "Error opening output rtmps://live.twitch.tv:443/app/live_secret_key_value: Connection refused";
        const redacted = redactRestreamError(raw, key);
        assert.equal(redacted.includes("rtmps://"), false);
        assert.equal(redacted.includes("rtmp"), false);
        assert.equal(redacted.includes(key), false);
        assert.match(redacted, /Connection refused|ffmpeg|error/i);
    });

    it("shows off when control is disabled even if sidecar status was left live", () => {
        const shown = displayRestreamStatus(
            {enabled: false},
            {state: "live", updatedAt: "2026-08-25T14:00:00.000Z", lastError: ""},
            Date.parse("2026-08-25T14:00:05.000Z"),
        );
        assert.equal(shown.state, "off");
    });

    it("treats a stale live heartbeat as off", () => {
        const shown = displayRestreamStatus(
            {enabled: true},
            {state: "live", updatedAt: "2026-08-25T14:00:00.000Z", lastError: ""},
            Date.parse("2026-08-25T14:01:00.000Z"),
        );
        assert.equal(shown.state, "off");
    });
});

describe("mergeOverlayGrowPoll", () => {
    const locked = {
        plant: "Cannabis",
        name: "Godfather OG",
        seededAt: "2026-08-21",
        overlayLayout: "left-rail" as const,
        overlayStream: "include" as const,
        overlayScalePct: 100,
        streamUrl: "http://mediamtx:8888/growcam/",
        stage: "Seed",
        lightSchedule: "12/12",
        strain: "",
    };
    const publicPoll = {
        ...locked,
        name: "Updated",
        overlayLayout: "bottom-bar" as const,
        overlayScalePct: 75,
        overlayStream: "transparent" as const,
        streamUrl: "https://stream.example.com/growcam/",
        stage: "Veg",
    };

    it("keeps include-stream and capture URL when locked, and still takes identity", () => {
        const merged = mergeOverlayGrowPoll(locked, publicPoll, true);
        assert.equal(merged.overlayStream, "include");
        assert.equal(merged.streamUrl, "http://mediamtx:8888/growcam/");
        assert.equal(merged.name, "Updated");
        assert.equal(merged.overlayLayout, "bottom-bar");
        assert.equal(merged.overlayScalePct, 75);
        assert.equal(merged.stage, "Veg");
    });

    it("adopts the public poll when not locked", () => {
        const merged = mergeOverlayGrowPoll(locked, publicPoll, false);
        assert.equal(merged.overlayStream, "transparent");
        assert.equal(merged.streamUrl, "https://stream.example.com/growcam/");
        assert.equal(merged.name, "Updated");
    });
});

describe("restream capture gate", () => {
    it("fails closed without a configured token", () => {
        assert.equal(getRestreamTokenFromEnv({}), undefined);
        assert.equal(isRestreamCaptureAuthorized(undefined, "secret"), false);
        assert.equal(isRestreamCaptureAuthorized("secret", "secret"), true);
        assert.equal(isRestreamCaptureAuthorized("secret", "nope"), false);
        assert.equal(isRestreamCaptureAuthorized("secret", undefined), false);
    });

    it("uses GROWCAST_RESTREAM_STREAM_URL when set", () => {
        assert.equal(
            captureStreamUrl("https://stream.example.com/growcam/", {
                GROWCAST_RESTREAM_STREAM_URL: "http://mediamtx:8888/growcam/",
            }),
            "http://mediamtx:8888/growcam/",
        );
        assert.equal(
            captureStreamUrl("https://stream.example.com/growcam/", {}),
            "https://stream.example.com/growcam/",
        );
    });
});

describe("restream chrome", () => {
    it("does not add Capture or Twitch to public nav", () => {
        const flags: NavFlags = {
            showEnergy: true,
            showGallery: true,
            showPastGrows: true,
            showSettingsLink: true,
        };
        for (const pathname of ["/", "/overlay", "/admin"]) {
            const items = navItemsFor(pathname, flags);
            assert.equal(
                items.some((item) => /capture|twitch/i.test(item.href + item.label)),
                false,
            );
        }
    });

    it("capture page forces include-stream and is not in public overlay chrome tests", () => {
        const captureSrc = readFileSync(
            path.join(process.cwd(), "app", "overlay", "capture", "page.tsx"),
            "utf8",
        );
        const fieldsSrc = readFileSync(
            path.join(process.cwd(), "app", "admin", "restream-panel.tsx"),
            "utf8",
        );
        const composeSrc = readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
        const hudSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-hud.tsx"),
            "utf8",
        );
        const sidecarSrc = readFileSync(
            path.join(process.cwd(), "extensions", "GrowCast-Restream", "restream.py"),
            "utf8",
        );
        const dockerSrc = readFileSync(
            path.join(process.cwd(), "extensions", "GrowCast-Restream", "Dockerfile"),
            "utf8",
        );
        assert.match(captureSrc, /overlayStream=["']include["']/);
        assert.match(captureSrc, /lockStream/);
        assert.match(hudSrc, /mergeOverlayGrowPoll/);
        assert.match(captureSrc, /isRestreamCaptureAuthorized/);
        assert.match(composeSrc, /env_file:/);
        assert.doesNotMatch(composeSrc, /GROWCAST_RESTREAM_TOKEN:\s*\$\{GROWCAST_RESTREAM_TOKEN/);
        assert.match(dockerSrc, /USER 1001/);
        assert.match(sidecarSrc, /SIGTERM/);
        assert.match(sidecarSrc, /redact/);
        assert.match(fieldsSrc, /id="twitch"/);
        assert.match(composeSrc, /^\s*ggs:\s*$/m);
        assert.match(composeSrc, /^\s*restream:\s*$/m);
        assert.doesNotMatch(composeSrc, /profiles:/);
        assert.doesNotMatch(captureSrc, /SiteHeader/);
    });
});
