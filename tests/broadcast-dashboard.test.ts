import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, readFile, rm, stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {ADMIN_HASH_REDIRECTS} from "../app/admin/hash-redirects.ts";
import {parseStreamSettingsForm} from "../lib/admin/parse-grow-form.ts";
import {atomicWriteFile} from "../lib/atomic-file.ts";
import {getCurrentGrow} from "../lib/db.ts";
import {
    BROADCAST_POLL_MS,
    isTwitchLogin,
    parsePublicBroadcastBody,
    publicBroadcastPayload,
} from "../lib/restream/broadcast.ts";
import {ensureRestreamCaptureToken} from "../lib/restream/capture.ts";
import {restreamChannelFile, restreamStatusFile} from "../lib/restream/paths.ts";
import {
    EMPTY_RESTREAM_CHANNEL,
    broadcastGetResponse,
    parseRestreamChannel,
    readRestreamKey,
    readRestreamPublicView,
    saveRestreamKey,
    setRestreamEnabled,
    writeRestreamChannel,
} from "../lib/restream/store.ts";
import {
    isInvalidTypedChannelLogin,
    resolveChannelLogin,
    streamKeyForChannelLookup,
    twitchUserIdFromStreamKey,
} from "../lib/restream/twitch-helix.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-broadcast-"));
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

async function writeSidecarStatus(state: string, updatedAt: string): Promise<void> {
    await atomicWriteFile(
        restreamStatusFile(),
        `${JSON.stringify({state, updatedAt, lastError: ""}, null, 2)}\n`,
    );
}

const helixEnv = {
    TWITCH_CLIENT_ID: "test-client-id",
    TWITCH_CLIENT_SECRET: "helix-secret-value",
};

describe("broadcast chrome", () => {
    it("labels the admin nav Broadcast with href /admin/stream", () => {
        const chromeSrc = src(path.join("app", "admin", "admin-chrome.tsx"));
        const streamPage = src(path.join("app", "admin", "stream", "page.tsx"));
        const alias = src(path.join("app", "admin", "broadcast", "page.tsx"));
        assert.match(chromeSrc, /href: "\/admin\/stream"/);
        assert.match(chromeSrc, /label: "Broadcast"/);
        assert.doesNotMatch(chromeSrc, /label: "Stream"/);
        assert.match(streamPage, /title="Broadcast"/);
        assert.match(alias, /redirect\("\/admin\/stream"\)/);
        assert.equal(ADMIN_HASH_REDIRECTS["#twitch"], "/admin/stream");
        assert.equal(ADMIN_HASH_REDIRECTS["#overlay"], "/admin/stream");
        assert.equal(ADMIN_HASH_REDIRECTS["#stream"], "/admin/stream");
    });

    it("renders OverlayHud include+lockStream on the program monitor without ON AIR", () => {
        const preview = src(path.join("app", "admin", "stream-preview.tsx"));
        const streamPage = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(preview, /overlayStream="include"/);
        assert.match(preview, /lockStream/);
        assert.match(preview, /streamUrl=\{grow\.streamUrl\}/);
        assert.match(preview, /Save a Stream URL/);
        assert.doesNotMatch(preview, /ON AIR/);
        assert.doesNotMatch(streamPage, /ON AIR/);
        assert.doesNotMatch(preview, /\/overlay\/capture/);
        assert.doesNotMatch(streamPage, /<iframe/);
    });

    it("wires overlay and camera grow fields to the disconnected broadcast-grow form", () => {
        const fields = src(path.join("app", "admin", "stream-fields.tsx"));
        const streamPage = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(fields, /name="overlayStream"\s+form=\{growForm\}/);
        assert.match(fields, /name="overlayLayout"\s+form=\{growForm\}/);
        assert.match(fields, /OverlayScaleInput defaultValue=\{grow\.overlayScalePct\} form=\{growForm\}/);
        assert.match(fields, /name="streamUrl"\s+form=\{growForm\}/);
        assert.match(fields, /name="showGrowName"\s+form=\{growForm\}/);
        assert.match(streamPage, /id="broadcast-grow"/);
        assert.match(streamPage, /form="broadcast-grow"/);
        assert.match(streamPage, /Save Changes/);
    });
});

describe("channel.json", () => {
    it("defaults toastEnabled to false and stays out of grow JSON", async () => {
        assert.deepEqual(parseRestreamChannel(null), EMPTY_RESTREAM_CHANNEL);
        assert.deepEqual(parseRestreamChannel({login: "0xmarcel"}), {
            login: "0xmarcel",
            toastEnabled: false,
        });

        await withTempDataDir(async (dir) => {
            await getCurrentGrow();
            await writeRestreamChannel({login: "0xmarcel", toastEnabled: false});
            const channelRaw = await readFile(restreamChannelFile(), "utf8");
            const growRaw = await readFile(path.join(dir, "current-grow.json"), "utf8");
            assert.match(channelRaw, /"toastEnabled": false/);
            assert.doesNotMatch(growRaw, /toastEnabled/);
            assert.doesNotMatch(growRaw, /0xmarcel/);
            const mode = (await stat(restreamChannelFile())).mode & 0o777;
            if (process.platform !== "win32") {
                assert.equal(mode, 0o600);
            }
        });
    });

    it("does not copy twitch login or toast into the stream grow form", () => {
        const form = new FormData();
        form.set("streamUrl", "https://stream.example.com/hls/");
        form.set("twitchLogin", "0xmarcel");
        form.set("toastEnabled", "on");
        const parsed = parseStreamSettingsForm(form);
        const serialized = JSON.stringify(parsed.grow);
        assert.equal(parsed.grow.streamUrl, "https://stream.example.com/hls/");
        assert.doesNotMatch(serialized, /0xmarcel/);
        assert.doesNotMatch(serialized, /toastEnabled/);
    });
});

describe("twitch helix login lookup", () => {
    it("parses live_{userId}_ stream keys", () => {
        assert.equal(twitchUserIdFromStreamKey("live_123_abc"), "123");
        assert.equal(twitchUserIdFromStreamKey(" live_99_rest "), "99");
        assert.equal(twitchUserIdFromStreamKey("live_123"), null);
        assert.equal(twitchUserIdFromStreamKey("not-a-key"), null);
    });

    it("fills login from Helix when the channel field is empty", async () => {
        const fetcher: typeof fetch = async (input, init) => {
            const url = String(input);
            if (url.includes("/oauth2/token")) {
                return Response.json({access_token: "app-token"});
            }
            if (url.includes("/helix/users")) {
                const headers = new Headers(init?.headers);
                assert.equal(headers.get("Authorization"), "Bearer app-token");
                assert.equal(headers.get("Client-Id"), "test-client-id");
                assert.match(url, /id=123/);
                return Response.json({data: [{id: "123", login: "helixuser"}]});
            }
            throw new Error(`unexpected ${url}`);
        };

        const login = await resolveChannelLogin(
            {typedLogin: "", streamKey: "live_123_abc", previousLogin: ""},
            helixEnv,
            fetcher,
        );
        assert.equal(login, "helixuser");
    });

    it("lets a non-empty valid typed login win over Helix", async () => {
        let calls = 0;
        const unused: typeof fetch = async () => {
            calls += 1;
            return new Response("nope", {status: 500});
        };
        const login = await resolveChannelLogin(
            {typedLogin: "0xmarcel", streamKey: "live_123_abc", previousLogin: "old"},
            helixEnv,
            unused,
        );
        assert.equal(login, "0xmarcel");
        assert.equal(calls, 0);

        assert.equal(
            await resolveChannelLogin(
                {typedLogin: "old", streamKey: "live_99_abc", previousLogin: "old"},
                helixEnv,
                unused,
            ),
            "old",
        );
        assert.equal(calls, 0);
    });

    it("ignores a typed login that is not letters, digits, and underscore", async () => {
        assert.equal(isInvalidTypedChannelLogin("bad login", "kept"), true);
        assert.equal(isInvalidTypedChannelLogin("kept", "kept"), false);
        assert.equal(isInvalidTypedChannelLogin("0xmarcel", "kept"), false);

        const helixFetcher: typeof fetch = async (input) => {
            const url = String(input);
            if (url.includes("/oauth2/token")) {
                return Response.json({access_token: "app-token"});
            }
            if (url.includes("/helix/users")) {
                return Response.json({data: [{id: "123", login: "helixuser"}]});
            }
            throw new Error(`unexpected ${url}`);
        };
        assert.equal(
            await resolveChannelLogin(
                {typedLogin: "bad login", streamKey: "live_123_abc", previousLogin: "kept"},
                helixEnv,
                helixFetcher,
            ),
            "helixuser",
        );

        const failing: typeof fetch = async () => new Response("nope", {status: 503});
        assert.equal(
            await resolveChannelLogin(
                {typedLogin: "https://twitch.tv/nope", streamKey: "live_123_abc", previousLogin: "kept"},
                helixEnv,
                failing,
            ),
            "kept",
        );
    });

    it("uses the persisted stream key for Helix when the form key is blank", async () => {
        await withTempDataDir(async () => {
            await saveRestreamKey("live_123_secretkeyvalue");
            assert.equal(await readRestreamKey(), "live_123_secretkeyvalue");
            assert.equal(streamKeyForChannelLookup("", await readRestreamKey()), "live_123_secretkeyvalue");
            assert.equal(streamKeyForChannelLookup(" live_99_new ", await readRestreamKey()), "live_99_new");
            const view = await readRestreamPublicView();
            assert.equal("key" in view, false);
            assert.equal(JSON.stringify(view).includes("secretkeyvalue"), false);

            const helixFetcher: typeof fetch = async (input) => {
                const url = String(input);
                if (url.includes("/oauth2/token")) {
                    return Response.json({access_token: "app-token"});
                }
                if (url.includes("/helix/users")) {
                    assert.match(url, /id=123/);
                    return Response.json({data: [{id: "123", login: "helixuser"}]});
                }
                throw new Error(`unexpected ${url}`);
            };
            assert.equal(
                await resolveChannelLogin(
                    {
                        typedLogin: "",
                        streamKey: streamKeyForChannelLookup("", await readRestreamKey()),
                        previousLogin: "",
                    },
                    helixEnv,
                    helixFetcher,
                ),
                "helixuser",
            );
            const actions = src(path.join("app", "admin", "actions.ts"));
            assert.match(actions, /readRestreamKey/);
            assert.match(actions, /streamKeyForChannelLookup/);
            assert.match(actions, /twitch_login_invalid/);
        });
    });

    it("keeps the last login when Helix fails or the key is not live_{id}_", async () => {
        const failing: typeof fetch = async () => new Response("nope", {status: 503});
        assert.equal(
            await resolveChannelLogin(
                {typedLogin: "", streamKey: "live_123_abc", previousLogin: "kept"},
                helixEnv,
                failing,
            ),
            "kept",
        );
        let calls = 0;
        const unused: typeof fetch = async () => {
            calls += 1;
            return new Response("nope", {status: 500});
        };
        assert.equal(
            await resolveChannelLogin(
                {typedLogin: "", streamKey: "plain-key", previousLogin: "kept"},
                helixEnv,
                unused,
            ),
            "kept",
        );
        assert.equal(
            await resolveChannelLogin(
                {typedLogin: "", streamKey: "live_123_abc", previousLogin: "kept"},
                {},
                unused,
            ),
            "kept",
        );
        assert.equal(calls, 0);
    });
});

describe("GET /api/data/broadcast", () => {
    it("omits login unless the sidecar is live, toast is on, and login is valid", async () => {
        await withTempDataDir(async () => {
            const missing = await broadcastGetResponse();
            assert.equal(missing.status, 200);
            assert.deepEqual(await missing.json(), {live: false});

            await saveRestreamKey("live_123_secretkeyvalue");
            await setRestreamEnabled(true);
            await writeSidecarStatus("live", new Date().toISOString());
            await writeRestreamChannel({login: "0xmarcel", toastEnabled: false});

            const toastOff = await broadcastGetResponse();
            const toastOffBody = (await toastOff.json()) as Record<string, unknown>;
            assert.equal(toastOff.status, 200);
            assert.deepEqual(toastOffBody, {live: false});
            assert.equal("login" in toastOffBody, false);

            await writeRestreamChannel({login: "0xmarcel", toastEnabled: true});
            const live = await broadcastGetResponse();
            const liveBody = (await live.json()) as Record<string, unknown>;
            assert.equal(live.status, 200);
            assert.deepEqual(liveBody, {live: true, login: "0xmarcel"});

            await writeSidecarStatus(
                "live",
                new Date(Date.now() - 60_000).toISOString(),
            );
            const stale = await broadcastGetResponse();
            const staleBody = (await stale.json()) as Record<string, unknown>;
            assert.equal(stale.status, 200);
            assert.deepEqual(staleBody, {live: false});
            assert.equal("login" in staleBody, false);
        });
    });

    it("never includes the stream key, capture token, or Helix secret", async () => {
        await withTempDataDir(async () => {
            const previousSecret = process.env.TWITCH_CLIENT_SECRET;
            process.env.TWITCH_CLIENT_SECRET = "helix-secret-value";
            try {
                await saveRestreamKey("live_123_secretkeyvalue");
                const token = await ensureRestreamCaptureToken({});
                await setRestreamEnabled(true);
                await writeSidecarStatus("live", new Date().toISOString());
                await writeRestreamChannel({login: "0xmarcel", toastEnabled: true});
                const response = await broadcastGetResponse();
                const text = JSON.stringify(await response.json());
                assert.equal(response.status, 200);
                assert.equal(text.includes("secretkeyvalue"), false);
                assert.equal(text.includes(token), false);
                assert.equal(text.includes("helix-secret-value"), false);
                assert.equal(text.includes("TWITCH_CLIENT"), false);
                assert.match(text, /"live":true/);
            } finally {
                if (previousSecret === undefined) {
                    delete process.env.TWITCH_CLIENT_SECRET;
                } else {
                    process.env.TWITCH_CLIENT_SECRET = previousSecret;
                }
            }
        });
    });

    it("treats only letters, digits, and underscore as a Twitch login", () => {
        assert.equal(isTwitchLogin("0xmarcel"), true);
        assert.equal(isTwitchLogin(""), false);
        assert.equal(isTwitchLogin("bad login"), false);
        assert.deepEqual(
            publicBroadcastPayload({
                displayState: "live",
                toastEnabled: true,
                login: "bad login",
            }),
            {live: false},
        );
        assert.deepEqual(parsePublicBroadcastBody({live: false, login: "0xmarcel"}), {
            live: false,
        });
        assert.deepEqual(parsePublicBroadcastBody({live: true, login: "0xmarcel"}), {
            live: true,
            login: "0xmarcel",
        });
    });
});

describe("homepage toast", () => {
    it("mounts the toast poller only on the grow homepage and renders markup only when live", () => {
        const home = src(path.join("app", "(site)", "page.tsx"));
        const toast = src(path.join("components", "broadcast-toast.tsx"));
        assert.match(home, /BroadcastToast/);
        assert.match(toast, /if \(!payload\.live\)/);
        assert.match(toast, /Live on Twitch/);
        assert.match(toast, /#9146FF/);
        assert.match(toast, /twitch\.tv\/\{payload\.login\}/);
        assert.match(toast, /rel="noopener noreferrer"/);
        assert.match(toast, /target="_blank"/);
        assert.equal(BROADCAST_POLL_MS, 5_000);
        assert.doesNotMatch(toast, /<button/);
        assert.doesNotMatch(toast, /ON AIR/);
        assert.doesNotMatch(toast, /text-red|bg-red/);

        for (const rel of [
            path.join("app", "(site)", "layout.tsx"),
            path.join("app", "(site)", "energy", "page.tsx"),
            path.join("app", "(site)", "gallery", "page.tsx"),
            path.join("app", "(site)", "grows", "page.tsx"),
            path.join("app", "overlay", "page.tsx"),
            path.join("app", "overlay", "layout.tsx"),
            path.join("app", "overlay", "capture", "page.tsx"),
            path.join("app", "admin", "page.tsx"),
            path.join("app", "admin", "layout.tsx"),
        ]) {
            assert.doesNotMatch(src(rel), /BroadcastToast/);
        }
    });

    it("leaves overlay/capture and compose restream token interpolation unchanged", () => {
        const captureSrc = src(path.join("app", "overlay", "capture", "page.tsx"));
        const composeSrc = src("docker-compose.yml");
        const sidecarSrc = src(path.join("extensions", "GrowCast-Restream", "restream.py"));
        assert.match(captureSrc, /overlayStream=["']include["']/);
        assert.match(captureSrc, /lockStream/);
        assert.match(captureSrc, /isRestreamCaptureAuthorized/);
        assert.doesNotMatch(
            composeSrc,
            /GROWCAST_RESTREAM_TOKEN:\s*\$\{GROWCAST_RESTREAM_TOKEN/,
        );
        assert.doesNotMatch(sidecarSrc, /helix/i);
        assert.doesNotMatch(sidecarSrc, /TWITCH_CLIENT_SECRET/);
    });
});
