import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    _resetOverlayAlertHubForTests,
    peekOverlayAlertQueue,
} from "../lib/overlay-alert-hub.ts";
import {writeAlertsSettings} from "../lib/restream/alerts-settings.ts";
import {
    EVENTSUB_TYPES,
    ensureEventsubSubscriptions,
    eventsubNotificationResponse,
    mapEventsubNotification,
    verifyEventsubSignature,
} from "../lib/restream/eventsub.ts";
import {restreamEventsubSecretFile} from "../lib/restream/paths.ts";
import {writeTwitchOAuthFile} from "../lib/restream/twitch-oauth.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function sign(secret: string, id: string, ts: string, body: string): string {
    const hmac = createHmac("sha256", secret);
    hmac.update(id + ts + body);
    return `sha256=${hmac.digest("hex")}`;
}

function hexSign(secret: string, id: string, ts: string, body: string): string {
    return createHmac("sha256", secret).update(id + ts + body).digest("hex");
}

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-eventsub-"));
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

async function writeKnownSecret(secret: string): Promise<void> {
    const file = restreamEventsubSecretFile();
    await mkdir(path.dirname(file), {recursive: true});
    await writeFile(file, `${secret}\n`, "utf8");
}

function eventsubHeaders(input: {
    id: string;
    timestamp: string;
    signature: string;
    type: string;
}): Headers {
    return new Headers({
        "Twitch-Eventsub-Message-Id": input.id,
        "Twitch-Eventsub-Message-Timestamp": input.timestamp,
        "Twitch-Eventsub-Message-Signature": input.signature,
        "Twitch-Eventsub-Message-Type": input.type,
    });
}

const helixEnv = {
    TWITCH_CLIENT_ID: "test-client-id",
    TWITCH_CLIENT_SECRET: "helix-secret-value",
};

describe("verifyEventsubSignature", () => {
    it("accepts a valid hmac and rejects a bad one", () => {
        const body = "{\"ok\":true}";
        const id = "id1";
        const ts = "123";
        const secret = "s3cret";
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body,
                signature: sign(secret, id, ts, body),
            }),
            true,
        );
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body,
                signature: "sha256=deadbeef",
            }),
            false,
        );
    });

    it("accepts hex without sha256= prefix and rejects empty fields", () => {
        const body = "{\"ok\":true}";
        const id = "id1";
        const ts = "123";
        const secret = "s3cret";
        const hex = hexSign(secret, id, ts, body);
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body,
                signature: hex,
            }),
            true,
        );
        assert.equal(
            verifyEventsubSignature({
                secret: "",
                messageId: id,
                timestamp: ts,
                body,
                signature: sign(secret, id, ts, body),
            }),
            false,
        );
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: "",
                timestamp: ts,
                body,
                signature: sign(secret, id, ts, body),
            }),
            false,
        );
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: "",
                body,
                signature: sign(secret, id, ts, body),
            }),
            false,
        );
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body: "",
                signature: sign(secret, id, ts, body),
            }),
            false,
        );
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body,
                signature: "",
            }),
            false,
        );
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body,
                signature: "sha256=",
            }),
            false,
        );
    });
});

describe("mapEventsubNotification", () => {
    it("maps follow sub raid cheer", () => {
        assert.equal(mapEventsubNotification("channel.follow", {user_name: "Ada"} )?.kind, "follow");
        assert.equal(mapEventsubNotification("channel.subscribe", {user_name: "Ada"})?.kind, "sub");
        assert.equal(mapEventsubNotification("channel.raid", {from_broadcaster_user_name: "Ada"})?.kind, "raid");
        assert.equal(mapEventsubNotification("channel.cheer", {user_name: "Ada", bits: 100})?.kind, "bits");
        assert.equal(mapEventsubNotification("channel.chat.message", {}), null);
        assert.deepEqual(EVENTSUB_TYPES, [
            "channel.follow",
            "channel.subscribe",
            "channel.raid",
            "channel.cheer",
        ]);
    });

    it("fills titles and bodies for follow sub raid cheer", () => {
        assert.deepEqual(mapEventsubNotification("channel.follow", {user_name: "Ada"}), {
            kind: "follow",
            title: "Follow",
            body: "Ada",
        });
        assert.deepEqual(mapEventsubNotification("channel.subscribe", {user_name: "Ada"}), {
            kind: "sub",
            title: "Sub",
            body: "Ada",
        });
        assert.deepEqual(
            mapEventsubNotification("channel.raid", {from_broadcaster_user_name: "Ada"}),
            {kind: "raid", title: "Raid", body: "Ada"},
        );
        assert.deepEqual(
            mapEventsubNotification("channel.raid", {
                from_broadcaster_user_name: "Ada",
                viewer_count: 12,
            }),
            {kind: "raid", title: "Raid", body: "Ada · 12"},
        );
        assert.deepEqual(
            mapEventsubNotification("channel.raid", {
                from_broadcaster_user_name: "Ada",
                viewers: 9,
            }),
            {kind: "raid", title: "Raid", body: "Ada · 9"},
        );
        assert.deepEqual(
            mapEventsubNotification("channel.cheer", {user_name: "Ada", bits: 100}),
            {kind: "bits", title: "Bits", body: "Ada 100"},
        );
        assert.equal(mapEventsubNotification("channel.follow", "Ada"), null);
        assert.equal(mapEventsubNotification("channel.ban", {user_name: "Ada"}), null);
    });
});

describe("eventsubNotificationResponse", () => {
    it("publishes a signed notification and rejects unsigned", async () => {
        await withTempDataDir(async () => {
            const secret = "s3cret-eventsub";
            await writeKnownSecret(secret);
            _resetOverlayAlertHubForTests();
            try {
                const id = "msg-follow-1";
                const ts = "1710000000";
                const body = JSON.stringify({
                    subscription: {type: "channel.follow"},
                    event: {user_name: "Ada"},
                });
                const signed = await eventsubNotificationResponse(
                    body,
                    eventsubHeaders({
                        id,
                        timestamp: ts,
                        signature: sign(secret, id, ts, body),
                        type: "notification",
                    }),
                    {admin: false},
                );
                assert.equal(signed.status, 204);
                const published = peekOverlayAlertQueue().find((alert) => alert.id === id);
                assert.ok(published);
                assert.equal(published.kind, "follow");
                assert.equal(published.title, "Follow");
                assert.equal(published.body, "Ada");

                const before = peekOverlayAlertQueue().length;
                const unsigned = await eventsubNotificationResponse(
                    body,
                    eventsubHeaders({
                        id: "msg-unsigned",
                        timestamp: ts,
                        signature: "sha256=deadbeef",
                        type: "notification",
                    }),
                    {admin: false},
                );
                assert.equal(unsigned.status, 403);
                assert.equal(peekOverlayAlertQueue().length, before);
                assert.equal(
                    peekOverlayAlertQueue().some((alert) => alert.id === "msg-unsigned"),
                    false,
                );
            } finally {
                _resetOverlayAlertHubForTests();
            }
        });
    });

    it("returns webhook_callback_verification challenge as text/plain 200", async () => {
        await withTempDataDir(async () => {
            const secret = "s3cret-eventsub";
            await writeKnownSecret(secret);
            const id = "msg-challenge-1";
            const ts = "1710000001";
            const body = JSON.stringify({challenge: "pogchamp-kappa-360noscope"});
            const response = await eventsubNotificationResponse(
                body,
                eventsubHeaders({
                    id,
                    timestamp: ts,
                    signature: sign(secret, id, ts, body),
                    type: "webhook_callback_verification",
                }),
                {admin: false},
            );
            assert.equal(response.status, 200);
            assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
            assert.equal(await response.text(), "pogchamp-kappa-360noscope");
        });
    });

    it("returns 403 when the secret file is missing and 204 for revocation", async () => {
        await withTempDataDir(async () => {
            const secret = "s3cret-eventsub";
            const id = "msg-revoked";
            const ts = "1710000002";
            const body = JSON.stringify({subscription: {type: "channel.follow"}});
            const missing = await eventsubNotificationResponse(
                body,
                eventsubHeaders({
                    id,
                    timestamp: ts,
                    signature: sign(secret, id, ts, body),
                    type: "notification",
                }),
                {admin: false},
            );
            assert.equal(missing.status, 403);

            await writeKnownSecret(secret);
            const revoked = await eventsubNotificationResponse(
                body,
                eventsubHeaders({
                    id,
                    timestamp: ts,
                    signature: sign(secret, id, ts, body),
                    type: "revocation",
                }),
                {admin: false},
            );
            assert.equal(revoked.status, 204);
        });
    });

    it("does not enqueue when the mapped kind is toggled off", async () => {
        await withTempDataDir(async () => {
            const secret = "s3cret-eventsub";
            await writeKnownSecret(secret);
            await writeAlertsSettings({
                follow: false,
                sub: true,
                raid: true,
                bits: true,
                stingEnabled: true,
            });
            _resetOverlayAlertHubForTests();
            try {
                const id = "msg-follow-off";
                const ts = "1710000003";
                const body = JSON.stringify({
                    subscription: {type: "channel.follow"},
                    event: {user_name: "Ada"},
                });
                const response = await eventsubNotificationResponse(
                    body,
                    eventsubHeaders({
                        id,
                        timestamp: ts,
                        signature: sign(secret, id, ts, body),
                        type: "notification",
                    }),
                    {admin: false},
                );
                assert.equal(response.status, 204);
                assert.equal(peekOverlayAlertQueue().length, 0);
            } finally {
                _resetOverlayAlertHubForTests();
            }
        });
    });
});

describe("ensureEventsubSubscriptions", () => {
    it("posts Helix webhooks for follow v2 raid to_broadcaster and ignores 409", async () => {
        await withTempDataDir(async () => {
            await writeTwitchOAuthFile({
                accessToken: "user-access-token",
                refreshToken: "user-refresh-token",
                userId: "141981764",
                login: "0xmarcel",
            });
            await writeKnownSecret("known-eventsub-secret");

            const posts: Array<{
                url: string;
                method: string;
                headers: Headers;
                body: Record<string, unknown>;
            }> = [];
            const fetcher: typeof fetch = async (input, init) => {
                posts.push({
                    url: String(input),
                    method: String(init?.method ?? "GET"),
                    headers: new Headers(init?.headers),
                    body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
                });
                return new Response(null, {status: 409});
            };

            await ensureEventsubSubscriptions("https://grow.example/", helixEnv, fetcher);
            assert.equal(posts.length, 4);
            assert.deepEqual(
                posts.map((post) => post.body.type),
                [...EVENTSUB_TYPES],
            );
            for (const post of posts) {
                assert.equal(post.url, "https://api.twitch.tv/helix/eventsub/subscriptions");
                assert.equal(post.method, "POST");
                assert.equal(post.headers.get("Authorization"), "Bearer user-access-token");
                assert.equal(post.headers.get("Client-Id"), "test-client-id");
                const transport = post.body.transport as Record<string, unknown>;
                assert.equal(transport.method, "webhook");
                assert.equal(transport.callback, "https://grow.example/api/twitch/eventsub");
                assert.equal(transport.secret, "known-eventsub-secret");
            }

            const follow = posts[0].body;
            assert.equal(follow.version, "2");
            assert.deepEqual(follow.condition, {
                broadcaster_user_id: "141981764",
                moderator_user_id: "141981764",
            });

            const sub = posts[1].body;
            assert.equal(sub.version, "1");
            assert.deepEqual(sub.condition, {broadcaster_user_id: "141981764"});

            const raid = posts[2].body;
            assert.equal(raid.version, "1");
            assert.deepEqual(raid.condition, {to_broadcaster_user_id: "141981764"});

            const cheer = posts[3].body;
            assert.equal(cheer.version, "1");
            assert.deepEqual(cheer.condition, {broadcaster_user_id: "141981764"});
        });
    });

    it("creates a 600 hex secret and does not fetch without oauth", async () => {
        await withTempDataDir(async () => {
            let fetched = false;
            await ensureEventsubSubscriptions(
                "https://grow.example",
                helixEnv,
                async () => {
                    fetched = true;
                    throw new Error("should not fetch");
                },
            );
            assert.equal(fetched, false);
            const secretPath = restreamEventsubSecretFile();
            const secret = (await readFile(secretPath, "utf8")).trim();
            assert.match(secret, /^[0-9a-f]{64}$/);
            if (process.platform !== "win32") {
                assert.equal((await stat(secretPath)).mode & 0o777, 0o600);
            }

            await writeTwitchOAuthFile({
                accessToken: "user-access-token",
                refreshToken: "user-refresh-token",
                userId: "1",
                login: "0xmarcel",
            });
            const reused: string[] = [];
            const fetcher: typeof fetch = async (_input, init) => {
                const body = JSON.parse(String(init?.body ?? "{}")) as {
                    transport?: {secret?: string};
                };
                reused.push(body.transport?.secret ?? "");
                return new Response(null, {status: 202});
            };
            await ensureEventsubSubscriptions("https://grow.example", helixEnv, fetcher);
            assert.equal(reused.length, 4);
            assert.ok(reused.every((value) => value === secret));
        });
    });
});

describe("EventSub route and files", () => {
    it("is a public HMAC webhook that reads the raw body first", () => {
        const route = src(path.join("app", "api", "twitch", "eventsub", "route.ts"));
        assert.match(route, /await request\.text\(\)/);
        assert.match(route, /eventsubNotificationResponse/);
        assert.match(route, /withRequestLog/);
        assert.match(route, /Twitch-Eventsub-Message-Id|request\.headers/);
        assert.doesNotMatch(route, /isAdminAuthenticated|requireAdmin/);
        assert.doesNotMatch(route, /request\.json\(/);
        assert.doesNotMatch(route, /console\.(log|info|debug|warn|error)/);
        assert.doesNotMatch(route, /current-grow|getCurrentGrow|writeGrow/);

        const eventsub = src(path.join("lib", "restream", "eventsub.ts"));
        assert.match(eventsub, /safeEqualText/);
        assert.match(eventsub, /sha256=/);
        assert.match(eventsub, /digest\("hex"\)/);
        assert.match(eventsub, /randomBytes\(32\)/);
        assert.match(eventsub, /toString\("hex"\)/);
        assert.match(eventsub, /0o600/);
        assert.match(eventsub, /to_broadcaster_user_id/);
        assert.match(eventsub, /moderator_user_id/);
        assert.match(eventsub, /helix\/eventsub\/subscriptions/);
        assert.match(eventsub, /status !== 409|status === 409/);
        assert.match(eventsub, /readAlertsSettings/);
        assert.match(eventsub, /publishOverlayAlert/);
        assert.match(eventsub, /text\/plain/);
        assert.doesNotMatch(eventsub, /isAdminAuthenticated|requireAdmin/);
        assert.doesNotMatch(eventsub, /console\.(log|info|debug|warn|error)/);
        assert.doesNotMatch(eventsub, /current-grow|getCurrentGrow|writeGrow/);
        assert.doesNotMatch(eventsub, /childLogger\([^)]*rawBody|log\.[a-z]+\([^)]*rawBody/);
    });
});
