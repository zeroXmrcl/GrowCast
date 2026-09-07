import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, readFile, rm, stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {REDACT_PATHS} from "../lib/logging/redact.ts";
import {restreamOAuthFile} from "../lib/restream/paths.ts";
import {
    TWITCH_OAUTH_SCOPES,
    buildTwitchAuthorizeUrl,
    exchangeTwitchCode,
    parseTwitchOAuthFile,
    readTwitchOAuthFile,
    refreshTwitchToken,
    writeTwitchOAuthFile,
} from "../lib/restream/twitch-oauth.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-twitch-oauth-"));
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

const oauthEnv = {
    TWITCH_CLIENT_ID: "test-client-id",
    TWITCH_CLIENT_SECRET: "helix-secret-value",
};

describe("Twitch OAuth", () => {
    it("uses only follow sub bits scopes and stores refresh off grow JSON", () => {
        assert.deepEqual(TWITCH_OAUTH_SCOPES, [
            "moderator:read:followers",
            "channel:read:subscriptions",
            "bits:read",
        ]);
        const url = buildTwitchAuthorizeUrl({
            clientId: "abc",
            redirectUri: "https://grow.example/admin/stream/twitch-callback",
            state: "st",
        });
        assert.match(url, /id\.twitch\.tv\/oauth2\/authorize/);
        assert.match(url, /client_id=abc/);
        assert.match(url, /state=st/);
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("response_type"), "code");
        assert.equal(
            parsedUrl.searchParams.get("redirect_uri"),
            "https://grow.example/admin/stream/twitch-callback",
        );
        assert.equal(
            parsedUrl.searchParams.get("scope"),
            "moderator:read:followers channel:read:subscriptions bits:read",
        );
        const parsed = parseTwitchOAuthFile({
            accessToken: "a",
            refreshToken: "r",
            userId: "1",
            login: "0xmarcel",
        });
        assert.equal(parsed?.login, "0xmarcel");
        assert.equal(parseTwitchOAuthFile(null), null);
        assert.equal(parseTwitchOAuthFile({accessToken: "a"}), null);
        assert.equal(
            parseTwitchOAuthFile({
                accessToken: "a",
                refreshToken: "r",
                userId: "1",
                login: "bad login",
            }),
            null,
        );
    });
});

describe("exchangeTwitchCode", () => {
    it("posts authorization_code and fills userId+login from Helix", async () => {
        const fetcher: typeof fetch = async (input, init) => {
            const url = String(input);
            if (url === "https://id.twitch.tv/oauth2/token") {
                assert.equal(init?.method, "POST");
                const params = new URLSearchParams(String(init?.body ?? ""));
                assert.equal(params.get("grant_type"), "authorization_code");
                assert.equal(params.get("code"), "auth-code");
                assert.equal(params.get("client_id"), "test-client-id");
                assert.equal(params.get("client_secret"), "helix-secret-value");
                assert.equal(
                    params.get("redirect_uri"),
                    "https://grow.example/admin/stream/twitch-callback",
                );
                return Response.json({
                    access_token: "user-access-token",
                    refresh_token: "user-refresh-token",
                    token_type: "bearer",
                });
            }
            if (url === "https://api.twitch.tv/helix/users") {
                const headers = new Headers(init?.headers);
                assert.equal(headers.get("Authorization"), "Bearer user-access-token");
                assert.equal(headers.get("Client-Id"), "test-client-id");
                return Response.json({data: [{id: "141981764", login: "0xmarcel"}]});
            }
            throw new Error(`unexpected ${url}`);
        };

        const parsed = await exchangeTwitchCode(
            "auth-code",
            "https://grow.example/admin/stream/twitch-callback",
            oauthEnv,
            fetcher,
        );
        assert.deepEqual(parsed, {
            accessToken: "user-access-token",
            refreshToken: "user-refresh-token",
            userId: "141981764",
            login: "0xmarcel",
        });
    });

    it("returns null when credentials, token JSON, or Helix user are missing", async () => {
        assert.equal(
            await exchangeTwitchCode("code", "https://grow.example/cb", {}, async () => {
                throw new Error("should not fetch");
            }),
            null,
        );

        const noToken: typeof fetch = async () => Response.json({token_type: "bearer"});
        assert.equal(
            await exchangeTwitchCode(
                "code",
                "https://grow.example/cb",
                oauthEnv,
                noToken,
            ),
            null,
        );

        const tokenThenEmptyUser: typeof fetch = async (input) => {
            if (String(input).includes("/oauth2/token")) {
                return Response.json({
                    access_token: "user-access-token",
                    refresh_token: "user-refresh-token",
                });
            }
            return Response.json({data: []});
        };
        assert.equal(
            await exchangeTwitchCode(
                "code",
                "https://grow.example/cb",
                oauthEnv,
                tokenThenEmptyUser,
            ),
            null,
        );
    });
});

describe("Twitch OAuth file", () => {
    it("writes twitch-oauth.json mode 600 off grow JSON", async () => {
        await withTempDataDir(async (dir) => {
            assert.equal(await readTwitchOAuthFile(), null);
            await writeTwitchOAuthFile({
                accessToken: "user-access-token",
                refreshToken: "user-refresh-token",
                userId: "1",
                login: "0xmarcel",
            });
            assert.equal(restreamOAuthFile(), path.join(dir, "restream", "twitch-oauth.json"));
            const onDisk = JSON.parse(
                await readFile(path.join(dir, "restream", "twitch-oauth.json"), "utf8"),
            ) as Record<string, unknown>;
            assert.equal(onDisk.accessToken, "user-access-token");
            assert.equal(onDisk.refreshToken, "user-refresh-token");
            assert.equal((await readTwitchOAuthFile())?.login, "0xmarcel");
            const mode = (await stat(path.join(dir, "restream", "twitch-oauth.json"))).mode & 0o777;
            if (process.platform !== "win32") {
                assert.equal(mode, 0o600);
            }
        });
    });
});

describe("refreshTwitchToken", () => {
    it("posts refresh_token and keeps userId+login", async () => {
        const fetcher: typeof fetch = async (input, init) => {
            const url = String(input);
            assert.equal(url, "https://id.twitch.tv/oauth2/token");
            const params = new URLSearchParams(String(init?.body ?? ""));
            assert.equal(params.get("grant_type"), "refresh_token");
            assert.equal(params.get("refresh_token"), "user-refresh-token");
            return Response.json({
                access_token: "next-access",
                refresh_token: "next-refresh",
            });
        };
        const parsed = await refreshTwitchToken(
            {
                accessToken: "old-access",
                refreshToken: "user-refresh-token",
                userId: "1",
                login: "0xmarcel",
            },
            oauthEnv,
            fetcher,
        );
        assert.deepEqual(parsed, {
            accessToken: "next-access",
            refreshToken: "next-refresh",
            userId: "1",
            login: "0xmarcel",
        });
    });
});

describe("Twitch OAuth routes and panel", () => {
    it("starts connect with admin session, csrf cookie, and 302 authorize URL", () => {
        const connect = src(path.join("app", "admin", "stream", "twitch-connect", "route.ts"));
        assert.match(connect, /isAdminAuthenticated/);
        assert.doesNotMatch(connect, /requireAdmin/);
        assert.match(connect, /randomBytes\(32\)/);
        assert.match(connect, /toString\("hex"\)/);
        assert.match(connect, /growcast_twitch_oauth_state/);
        assert.match(connect, /httpOnly:\s*true/);
        assert.match(connect, /sameSite:\s*"lax"/);
        assert.match(connect, /path:\s*"\/admin\/stream\/twitch-callback"/);
        assert.match(connect, /maxAge:\s*600/);
        assert.match(connect, /shouldUseSecureCookie/);
        assert.match(connect, /shareCardMetadataOrigin/);
        assert.match(connect, /buildTwitchAuthorizeUrl/);
        assert.match(connect, /status:\s*302/);
        assert.match(connect, /["']Cache-Control["']:\s*["']no-store["']/);
        assert.match(connect, /twitch_oauth_failed/);
        assert.doesNotMatch(connect, /ensureEventsub/);
    });

    it("validates callback state in constant time and subscribes EventSub after tokens", () => {
        const callback = src(path.join("app", "admin", "stream", "twitch-callback", "route.ts"));
        assert.match(callback, /isAdminAuthenticated/);
        assert.doesNotMatch(callback, /requireAdmin/);
        assert.match(callback, /safeEqualText/);
        assert.match(callback, /growcast_twitch_oauth_state/);
        assert.match(callback, /cookieStore\.delete\(\{[\s\S]*path:\s*"\/admin\/stream\/twitch-callback"[\s\S]*secure:\s*shouldUseSecureCookie[\s\S]*sameSite:\s*"lax"/);
        assert.match(callback, /["']Cache-Control["']:\s*["']no-store["']/);
        assert.match(callback, /exchangeTwitchCode/);
        assert.match(callback, /writeTwitchOAuthFile/);
        assert.match(callback, /ensureEventsubSubscriptions/);
        assert.match(callback, /shareCardMetadataOrigin/);
        assert.match(
            callback,
            /writeTwitchOAuthFile[\s\S]*ensureEventsubSubscriptions[\s\S]*twitch_connected/,
        );
        assert.match(callback, /twitch_connected/);
        assert.match(callback, /twitch_oauth_failed/);
        assert.match(callback, /sanitizeError/);
        assert.match(callback, /twitch\.eventsub\.failed/);
        assert.doesNotMatch(callback, /console\.(log|info|debug|warn|error)/);
    });

    it("uses a hard navigation for Connect Twitch so prefetch cannot rotate CSRF state", () => {
        const panel = src(path.join("app", "admin", "alerts-panel.tsx"));
        assert.doesNotMatch(panel, /from ["']next\/link["']/);
        assert.doesNotMatch(panel, /<Link\b/);
        assert.match(panel, /<a\s+href="\/admin\/stream\/twitch-connect"/);
    });

    it("does not log tokens and redacts camelCase token fields", () => {
        const oauth = src(path.join("lib", "restream", "twitch-oauth.ts"));
        assert.match(oauth, /sanitizeError/);
        assert.match(oauth, /atomicWriteFile/);
        assert.match(oauth, /restreamOAuthFile/);
        assert.match(oauth, /chmod/);
        assert.match(oauth, /0o600/);
        assert.doesNotMatch(oauth, /console\.(log|info|debug|warn|error)/);
        assert.doesNotMatch(oauth, /current-grow|getCurrentGrow|writeGrow/);
        assert.ok(REDACT_PATHS.includes("accessToken"));
        assert.ok(REDACT_PATHS.includes("refreshToken"));
        assert.ok(REDACT_PATHS.includes("access_token"));
        assert.ok(REDACT_PATHS.includes("refresh_token"));
    });
});
