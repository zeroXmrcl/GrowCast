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
    ensureEventsubSubscriptionsOnBoot,
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

function freshTimestamp(offsetMs = 0): string {
    return new Date(Date.now() + offsetMs).toISOString();
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
                const ts = freshTimestamp();
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
            const ts = freshTimestamp();
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
            const ts = freshTimestamp();
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
                alertScalePct: 100,
            });
            _resetOverlayAlertHubForTests();
            try {
                const id = "msg-follow-off";
                const ts = freshTimestamp();
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

    it("returns 403 when the message timestamp is older than 10 minutes", async () => {
        await withTempDataDir(async () => {
            const secret = "s3cret-eventsub";
            await writeKnownSecret(secret);
            _resetOverlayAlertHubForTests();
            try {
                const body = JSON.stringify({
                    subscription: {type: "channel.follow"},
                    event: {user_name: "Ada"},
                });
                const staleId = "msg-stale-ts";
                const staleTs = freshTimestamp(-11 * 60 * 1000);
                const stale = await eventsubNotificationResponse(
                    body,
                    eventsubHeaders({
                        id: staleId,
                        timestamp: staleTs,
                        signature: sign(secret, staleId, staleTs, body),
                        type: "notification",
                    }),
                    {admin: false},
                );
                assert.equal(stale.status, 403);

                const futureId = "msg-future-ts";
                const futureTs = freshTimestamp(11 * 60 * 1000);
                const future = await eventsubNotificationResponse(
                    body,
                    eventsubHeaders({
                        id: futureId,
                        timestamp: futureTs,
                        signature: sign(secret, futureId, futureTs, body),
                        type: "notification",
                    }),
                    {admin: false},
                );
                assert.equal(future.status, 403);
                assert.equal(
                    peekOverlayAlertQueue().some(
                        (alert) => alert.id === staleId || alert.id === futureId,
                    ),
                    false,
                );
            } finally {
                _resetOverlayAlertHubForTests();
            }
        });
    });
});

describe("ensureEventsubSubscriptions", () => {
    it("posts Helix webhooks with an app access token and replaces 409 subscriptions", async () => {
        await withTempDataDir(async () => {
            await writeTwitchOAuthFile({
                accessToken: "user-access",
                refreshToken: "user-refresh-token",
                userId: "141981764",
                login: "0xmarcel",
            });
            await writeKnownSecret("known-eventsub-secret");

            const calls: Array<{url: string; method: string; auth: string | null}> = [];
            const posts: Array<Record<string, unknown>> = [];
            const deleted = new Set<string>();
            const postAttempts = new Map<string, number>();

            const fetcher: typeof fetch = async (input, init) => {
                const url = String(input);
                const method = String(init?.method ?? "GET").toUpperCase();
                const headers = new Headers(init?.headers);
                const auth = headers.get("Authorization");
                calls.push({url, method, auth});

                if (url === "https://id.twitch.tv/oauth2/token") {
                    assert.equal(method, "POST");
                    const params = new URLSearchParams(String(init?.body ?? ""));
                    assert.equal(params.get("grant_type"), "client_credentials");
                    assert.equal(params.get("client_id"), "test-client-id");
                    assert.equal(params.get("client_secret"), "helix-secret-value");
                    return Response.json({access_token: "app-access"});
                }

                assert.equal(auth, "Bearer app-access");
                assert.notEqual(auth, "Bearer user-access");
                assert.equal(headers.get("Client-Id"), "test-client-id");

                const parsed = new URL(url);
                assert.equal(
                    `${parsed.origin}${parsed.pathname}`,
                    "https://api.twitch.tv/helix/eventsub/subscriptions",
                );

                if (method === "GET") {
                    const filters = ["status", "type", "user_id", "subscription_id", "conduit_id"].filter(
                        (key) => parsed.searchParams.has(key),
                    );
                    assert.deepEqual(filters, ["type"]);
                    const type = parsed.searchParams.get("type") ?? "";
                    const ours =
                        type === "channel.follow"
                            ? {
                                  broadcaster_user_id: "141981764",
                                  moderator_user_id: "141981764",
                              }
                            : type === "channel.raid"
                              ? {to_broadcaster_user_id: "141981764"}
                              : {broadcaster_user_id: "141981764"};
                    const other =
                        type === "channel.follow"
                            ? {broadcaster_user_id: "999", moderator_user_id: "999"}
                            : type === "channel.raid"
                              ? {to_broadcaster_user_id: "999"}
                              : {broadcaster_user_id: "999"};
                    const oursRow = deleted.has(`stale-${type}`)
                        ? {
                              id: `kept-${type}`,
                              type,
                              condition: ours,
                              transport: {
                                  method: "webhook",
                                  callback: "https://grow.example/api/twitch/eventsub",
                              },
                          }
                        : {
                              id: `stale-${type}`,
                              type,
                              condition: ours,
                              transport: {
                                  method: "webhook",
                                  callback: "https://old.example/api/twitch/eventsub",
                              },
                          };
                    return Response.json({
                        data: [
                            oursRow,
                            {
                                id: `other-${type}`,
                                type,
                                condition: other,
                                transport: {
                                    method: "webhook",
                                    callback: "https://old.example/api/twitch/eventsub",
                                },
                            },
                        ],
                    });
                }

                if (method === "DELETE") {
                    deleted.add(parsed.searchParams.get("id") ?? "");
                    return new Response(null, {status: 204});
                }

                assert.equal(method, "POST");
                const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
                const type = String(body.type ?? "");
                const attempt = (postAttempts.get(type) ?? 0) + 1;
                postAttempts.set(type, attempt);
                posts.push(body);
                return new Response(null, {status: 409});
            };

            await ensureEventsubSubscriptions("https://grow.example/", helixEnv, fetcher);

            assert.equal(calls[0]?.url, "https://id.twitch.tv/oauth2/token");
            assert.equal(
                calls.some((call) => call.auth === "Bearer user-access"),
                false,
            );
            assert.equal(posts.length, 8);
            assert.deepEqual(
                [...new Set(posts.map((post) => post.type))],
                [...EVENTSUB_TYPES],
            );
            for (const type of EVENTSUB_TYPES) {
                assert.equal(postAttempts.get(type), 2);
                assert.ok(deleted.has(`stale-${type}`));
                assert.equal(deleted.has(`other-${type}`), false);
                assert.equal(deleted.has(`kept-${type}`), false);
            }
            for (const post of posts) {
                const transport = post.transport as Record<string, unknown>;
                assert.equal(transport.method, "webhook");
                assert.equal(transport.callback, "https://grow.example/api/twitch/eventsub");
                assert.equal(transport.secret, "known-eventsub-secret");
            }

            const follow = posts.find((post) => post.type === "channel.follow");
            assert.ok(follow);
            assert.equal(follow.version, "2");
            assert.deepEqual(follow.condition, {
                broadcaster_user_id: "141981764",
                moderator_user_id: "141981764",
            });

            const sub = posts.find((post) => post.type === "channel.subscribe");
            assert.ok(sub);
            assert.equal(sub.version, "1");
            assert.deepEqual(sub.condition, {broadcaster_user_id: "141981764"});

            const raid = posts.find((post) => post.type === "channel.raid");
            assert.ok(raid);
            assert.equal(raid.version, "1");
            assert.deepEqual(raid.condition, {to_broadcaster_user_id: "141981764"});

            const cheer = posts.find((post) => post.type === "channel.cheer");
            assert.ok(cheer);
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
                accessToken: "user-access",
                refreshToken: "user-refresh-token",
                userId: "1",
                login: "0xmarcel",
            });
            const reused: string[] = [];
            const fetcher: typeof fetch = async (input, init) => {
                const url = String(input);
                if (url === "https://id.twitch.tv/oauth2/token") {
                    return Response.json({access_token: "app-access"});
                }
                const headers = new Headers(init?.headers);
                assert.equal(headers.get("Authorization"), "Bearer app-access");
                assert.notEqual(headers.get("Authorization"), "Bearer user-access");
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

describe("ensureEventsubSubscriptionsOnBoot", () => {
    it("skips without GROWCAST_PUBLIC_URL or oauth tokens", async () => {
        await withTempDataDir(async () => {
            let fetched = 0;
            const fetcher: typeof fetch = async () => {
                fetched += 1;
                throw new Error("should not fetch");
            };

            await ensureEventsubSubscriptionsOnBoot({}, fetcher);
            assert.equal(fetched, 0);

            await ensureEventsubSubscriptionsOnBoot(
                {GROWCAST_PUBLIC_URL: "https://grow.example", ...helixEnv},
                fetcher,
            );
            assert.equal(fetched, 0);

            await writeTwitchOAuthFile({
                accessToken: "user-access",
                refreshToken: "user-refresh-token",
                userId: "1",
                login: "0xmarcel",
            });
            await ensureEventsubSubscriptionsOnBoot({...helixEnv}, fetcher);
            assert.equal(fetched, 0);

            await ensureEventsubSubscriptionsOnBoot(
                {GROWCAST_PUBLIC_URL: "not a url", ...helixEnv},
                fetcher,
            );
            assert.equal(fetched, 0);
        });
    });

    it("renews EventSub when origin and tokens exist and does not throw on Helix failure", async () => {
        await withTempDataDir(async () => {
            await writeTwitchOAuthFile({
                accessToken: "user-access",
                refreshToken: "user-refresh-token",
                userId: "1",
                login: "0xmarcel",
            });
            const types: string[] = [];
            const methods: string[] = [];
            const fetcher: typeof fetch = async (input, init) => {
                const url = String(input);
                const method = String(init?.method ?? "GET").toUpperCase();
                methods.push(method);
                if (url === "https://id.twitch.tv/oauth2/token") {
                    return Response.json({access_token: "app-access"});
                }
                if (method === "GET") {
                    return Response.json({data: []});
                }
                assert.equal(method, "POST");
                const body = JSON.parse(String(init?.body ?? "{}")) as {type?: string};
                types.push(body.type ?? "");
                return new Response(null, {status: 202});
            };
            await ensureEventsubSubscriptionsOnBoot(
                {
                    GROWCAST_PUBLIC_URL: "https://grow.example/extra",
                    ...helixEnv,
                },
                fetcher,
            );
            assert.deepEqual(types, [...EVENTSUB_TYPES]);
            assert.equal(methods.includes("DELETE"), false);

            await ensureEventsubSubscriptionsOnBoot(
                {GROWCAST_PUBLIC_URL: "https://grow.example", ...helixEnv},
                async () => {
                    throw new Error("helix down");
                },
            );
        });
    });

    it("skips create when the callback already matches and never deletes on boot", async () => {
        await withTempDataDir(async () => {
            await writeTwitchOAuthFile({
                accessToken: "user-access",
                refreshToken: "user-refresh-token",
                userId: "141981764",
                login: "0xmarcel",
            });
            const posts: string[] = [];
            const deleted: string[] = [];
            const fetcher: typeof fetch = async (input, init) => {
                const url = String(input);
                const method = String(init?.method ?? "GET").toUpperCase();
                if (url === "https://id.twitch.tv/oauth2/token") {
                    return Response.json({access_token: "app-access"});
                }
                const parsed = new URL(url);
                if (method === "GET") {
                    const type = parsed.searchParams.get("type") ?? "";
                    const condition =
                        type === "channel.follow"
                            ? {
                                  broadcaster_user_id: "141981764",
                                  moderator_user_id: "141981764",
                              }
                            : type === "channel.raid"
                              ? {to_broadcaster_user_id: "141981764"}
                              : {broadcaster_user_id: "141981764"};
                    const ours =
                        type === "channel.follow" || type === "channel.subscribe"
                            ? {
                                  id: `live-${type}`,
                                  type,
                                  condition,
                                  transport: {
                                      method: "webhook",
                                      callback: "https://grow.example/api/twitch/eventsub",
                                  },
                              }
                            : {
                                  id: `stale-${type}`,
                                  type,
                                  condition,
                                  transport: {
                                      method: "webhook",
                                      callback: "https://old.example/api/twitch/eventsub",
                                  },
                              };
                    return Response.json({data: [ours]});
                }
                if (method === "DELETE") {
                    deleted.push(parsed.searchParams.get("id") ?? "");
                    return new Response(null, {status: 204});
                }
                const body = JSON.parse(String(init?.body ?? "{}")) as {type?: string};
                posts.push(body.type ?? "");
                return new Response(null, {status: 409});
            };
            await ensureEventsubSubscriptionsOnBoot(
                {GROWCAST_PUBLIC_URL: "https://grow.example", ...helixEnv},
                fetcher,
            );
            assert.deepEqual(posts.sort(), ["channel.cheer", "channel.raid"]);
            assert.deepEqual(deleted, []);
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
        assert.match(eventsub, /client_credentials/);
        assert.match(eventsub, /oauth2\/token/);
        assert.match(eventsub, /status !== 409|status === 409/);
        assert.match(eventsub, /method:\s*"DELETE"/);
        assert.doesNotMatch(eventsub, /Bearer \$\{oauth\.accessToken\}/);
        assert.match(eventsub, /readAlertsSettings/);
        assert.match(eventsub, /publishOverlayAlert/);
        assert.match(eventsub, /text\/plain/);
        assert.doesNotMatch(eventsub, /isAdminAuthenticated|requireAdmin/);
        assert.doesNotMatch(eventsub, /console\.(log|info|debug|warn|error)/);
        assert.doesNotMatch(eventsub, /current-grow|getCurrentGrow|writeGrow/);
        assert.doesNotMatch(eventsub, /childLogger\([^)]*rawBody|log\.[a-z]+\([^)]*rawBody/);

        const instrumentation = src("instrumentation.ts");
        assert.match(instrumentation, /ensureEventsubSubscriptionsOnBoot/);
        assert.match(instrumentation, /void Promise\.resolve\(\)\.then/);
        assert.match(instrumentation, /NEXT_RUNTIME === ["']nodejs["']/);
        assert.match(instrumentation, /phase-production-build/);
        assert.match(instrumentation, /twitch\.eventsub\.failed/);
        assert.match(instrumentation, /boot_failed/);
    });
});
