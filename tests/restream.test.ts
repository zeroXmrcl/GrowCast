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
    ensureRestreamCaptureToken,
    getRestreamTokenFromEnv,
    isRestreamCaptureAuthorized,
    readCaptureTokenFile,
    resolveRestreamCaptureToken,
} from "../lib/restream/capture.ts";
import {restreamCaptureTokenFile} from "../lib/restream/paths.ts";
import {mergeOverlayGrowPoll} from "../lib/overlay-grow.ts";
import {navItemsFor, type NavFlags} from "../lib/site-nav.ts";

function composeServiceBlock(compose: string, name: string): string {
    const heading = new RegExp(`^  ${name}:\\s*$`, "m");
    const match = heading.exec(compose);
    if (!match) {
        return "";
    }
    const from = match.index;
    const after = compose.slice(from + match[0].length);
    const next = /^  [A-Za-z0-9_-]+:\s*$/m.exec(after);
    return next ? compose.slice(from, from + match[0].length + next.index) : compose.slice(from);
}

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
            assert.equal(view.toastEnabled, false);
            assert.equal(view.login, "");
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

    it("creates capture.token with mode 600 when neither env nor file exist", async () => {
        await withTempDataDir(async () => {
            const previous = process.env.GROWCAST_RESTREAM_TOKEN;
            delete process.env.GROWCAST_RESTREAM_TOKEN;
            try {
                const token = await ensureRestreamCaptureToken({});
                assert.ok(token.length > 20);
                const onDisk = await readFile(restreamCaptureTokenFile(), "utf8");
                assert.equal(onDisk.trim(), token);
                const mode = (await stat(restreamCaptureTokenFile())).mode & 0o777;
                if (process.platform !== "win32") {
                    assert.equal(mode, 0o600);
                }
                assert.equal(await readCaptureTokenFile(), token);
                assert.equal(
                    isRestreamCaptureAuthorized(await resolveRestreamCaptureToken({}), token),
                    true,
                );
            } finally {
                if (previous === undefined) {
                    delete process.env.GROWCAST_RESTREAM_TOKEN;
                } else {
                    process.env.GROWCAST_RESTREAM_TOKEN = previous;
                }
            }
        });
    });

    it("persists GROWCAST_RESTREAM_TOKEN to capture.token so the sidecar shares it", async () => {
        await withTempDataDir(async () => {
            await ensureRestreamCaptureToken({});
            const generated = await readCaptureTokenFile();
            assert.ok(generated);
            const env = {GROWCAST_RESTREAM_TOKEN: "env-override-token"};
            assert.equal(await resolveRestreamCaptureToken(env), "env-override-token");
            assert.equal(await ensureRestreamCaptureToken(env), "env-override-token");
            assert.equal(await readCaptureTokenFile(), "env-override-token");
            const mode = (await stat(restreamCaptureTokenFile())).mode & 0o777;
            if (process.platform !== "win32") {
                assert.equal(mode, 0o600);
            }
            assert.notEqual(generated, "env-override-token");
            assert.equal(
                isRestreamCaptureAuthorized(
                    await resolveRestreamCaptureToken(env),
                    "env-override-token",
                ),
                true,
            );
        });
    });

    it("writes env token to capture.token when the file is missing", async () => {
        await withTempDataDir(async () => {
            const env = {GROWCAST_RESTREAM_TOKEN: "env-only-token"};
            assert.equal(await ensureRestreamCaptureToken(env), "env-only-token");
            assert.equal(await readCaptureTokenFile(), "env-only-token");
            const mode = (await stat(restreamCaptureTokenFile())).mode & 0o777;
            if (process.platform !== "win32") {
                assert.equal(mode, 0o600);
            }
        });
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
        const sceneSrc = readFileSync(
            path.join(process.cwd(), "components", "program-scene.tsx"),
            "utf8",
        );
        const lookHudSrc = readFileSync(
            path.join(process.cwd(), "components", "program-camera-look.tsx"),
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
        assert.match(lookHudSrc, /overlayStream=["']include["']/);
        assert.match(sceneSrc, /ProgramCameraLook/);
        assert.match(sceneSrc, /lockStream/);
        assert.match(hudSrc, /mergeOverlayGrowPoll/);
        assert.match(captureSrc, /isRestreamCaptureAuthorized/);
        assert.match(captureSrc, /ensureRestreamCaptureToken/);
        const restreamBlock = composeServiceBlock(composeSrc, "restream");
        assert.doesNotMatch(restreamBlock, /path:\s*\.env\.local/);
        assert.doesNotMatch(restreamBlock, /env_file:/);
        assert.doesNotMatch(
            restreamBlock,
            /GROWCAST_RESTREAM_TOKEN:\s*\$\{GROWCAST_RESTREAM_TOKEN/,
        );
        assert.match(dockerSrc, /USER 1001/);
        assert.match(sidecarSrc, /SIGTERM/);
        assert.match(sidecarSrc, /redact/);
        assert.match(sidecarSrc, /logging.getLogger/);
        assert.match(sidecarSrc, /log\.info/);
        assert.match(sidecarSrc, /starting chromium kiosk/);
        assert.match(sidecarSrc, /starting ffmpeg ingest=/);
        assert.match(sidecarSrc, /idle \(Settings Start not pressed\)/);
        assert.match(sidecarSrc, /still live/);
        assert.match(sidecarSrc, /capture\.token/);
        assert.match(sidecarSrc, /GROWCAST_RESTREAM_TOKEN/);
        assert.match(sidecarSrc, /def capture_token\(/);
        assert.match(sidecarSrc, /token=missing/);
        assert.doesNotMatch(sidecarSrc, /random\.(?:randbytes|token_bytes|urlsafe)/);
        assert.doesNotMatch(sidecarSrc, /TOKEN_FILE\.write/);
        assert.doesNotMatch(sidecarSrc, /log\.(?:info|warning|error)\([^)]*FFMPEG_OUTPUT/);
        assert.doesNotMatch(sidecarSrc, /log\.info\([^)]*token=\{TOKEN\}/);
        assert.match(fieldsSrc, /id="twitch"/);
        assert.match(composeSrc, /^\s*ggs:\s*$/m);
        assert.match(composeSrc, /^\s*restream:\s*$/m);
        assert.doesNotMatch(composeSrc, /profiles:/);
        assert.doesNotMatch(captureSrc, /SiteHeader/);
    });

    it("captures pulse audio and falls back to anullsrc", () => {
        const py = readFileSync(
            path.join(process.cwd(), "extensions", "GrowCast-Restream", "restream.py"),
            "utf8",
        );
        const docker = readFileSync(
            path.join(process.cwd(), "extensions", "GrowCast-Restream", "Dockerfile"),
            "utf8",
        );
        assert.match(docker, /pulseaudio/);
        assert.match(docker, /pulseaudio-utils/);
        assert.match(py, /pulseaudio/);
        assert.match(py, /--exit-idle-time=-1/);
        assert.match(py, /--disable-shm/);
        assert.match(py, /PULSE_SERVER/);
        assert.match(py, /pulse\/native/);
        assert.match(py, /get-default-source/);
        assert.match(py, /-f pulse -i/);
        assert.match(py, /anullsrc/);
        assert.match(py, /ffmpeg audio=/);
        assert.match(py, /--autoplay-policy=no-user-gesture-required/);
        assert.doesNotMatch(py, /-shortest/);
        assert.doesNotMatch(py, /\*\*os\.environ/);
        assert.doesNotMatch(py, /helix/i);
        assert.doesNotMatch(py, /TWITCH_CLIENT_SECRET/);
    });

    it("does not load GrowCast .env.local into restream", () => {
        const compose = readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
        const sidecarSrc = readFileSync(
            path.join(process.cwd(), "extensions", "GrowCast-Restream", "restream.py"),
            "utf8",
        );
        const restream = composeServiceBlock(compose, "restream");
        assert.doesNotMatch(restream, /path:\s*\.env\.local/);
        assert.doesNotMatch(restream, /env_file:/);
        assert.equal(compose.includes("GROWCAST_URL: http://growcast:3000"), true);
        assert.doesNotMatch(
            restream,
            /GROWCAST_RESTREAM_TOKEN:\s*\$\{GROWCAST_RESTREAM_TOKEN/,
        );
        assert.doesNotMatch(restream, /GROWCAST_RESTREAM_STREAM_URL/);
        assert.doesNotMatch(restream, /TWITCH_CLIENT_SECRET/);
        assert.doesNotMatch(restream, /helix/i);
        assert.doesNotMatch(sidecarSrc, /helix/i);
        assert.doesNotMatch(sidecarSrc, /TWITCH_CLIENT_SECRET/);
    });
});
