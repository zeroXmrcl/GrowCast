import {createHmac, randomBytes} from "node:crypto";
import {chmod, readFile} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import {asString, isRecord} from "@/lib/coerce";
import {safeEqualText} from "@/lib/crypto-equal";
import {sanitizeError} from "@/lib/logging/redact";
import {childLogger} from "@/lib/logging/logger";
import type {OverlayAlert} from "@/lib/overlay-alert";
import {publishOverlayAlert} from "@/lib/overlay-alert-hub";
import {readAlertsSettings} from "@/lib/restream/alerts-settings";
import {restreamDir, restreamEventsubSecretFile} from "@/lib/restream/paths";
import {readTwitchOAuthFile} from "@/lib/restream/twitch-oauth";

const EVENTSUB_SUBSCRIPTIONS_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const EVENTSUB_TIMEOUT_MS = 8_000;
const SHA256_PREFIX = "sha256=";

export const EVENTSUB_TYPES = [
    "channel.follow",
    "channel.subscribe",
    "channel.raid",
    "channel.cheer",
] as const;

export type EventsubType = (typeof EVENTSUB_TYPES)[number];

type MappedAlert = Omit<OverlayAlert, "id" | "createdAt">;

function logEventsubFailed(fields: Record<string, unknown>): void {
    childLogger().warn({event: "twitch.eventsub.failed", ...fields});
}

function finiteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
}

function noStore(status: number, body: string | null, contentType?: string): Response {
    const headers = new Headers({"Cache-Control": "no-store"});
    if (contentType) {
        headers.set("Content-Type", contentType);
    }
    return new Response(body, {status, headers});
}

function forbidden(): Response {
    return noStore(403, null);
}

function noContent(): Response {
    return noStore(204, null);
}

export function verifyEventsubSignature(input: {
    secret: string;
    messageId: string;
    timestamp: string;
    body: string;
    signature: string;
}): boolean {
    const {secret, messageId, timestamp, body, signature} = input;
    if (!secret || !messageId || !timestamp || !body || !signature) {
        return false;
    }
    const provided = signature.startsWith(SHA256_PREFIX)
        ? signature.slice(SHA256_PREFIX.length)
        : signature;
    if (!provided) {
        return false;
    }
    const expected = createHmac("sha256", secret)
        .update(messageId + timestamp + body)
        .digest("hex");
    return safeEqualText(provided, expected);
}

export function mapEventsubNotification(
    type: string,
    event: unknown,
): MappedAlert | null {
    if (!isRecord(event)) {
        return null;
    }
    if (type === "channel.follow") {
        return {kind: "follow", title: "Follow", body: asString(event.user_name).trim()};
    }
    if (type === "channel.subscribe") {
        return {kind: "sub", title: "Sub", body: asString(event.user_name).trim()};
    }
    if (type === "channel.raid") {
        const name = asString(event.from_broadcaster_user_name).trim();
        const count = finiteNumber(event.viewer_count) ?? finiteNumber(event.viewers);
        const body = count === null ? name : name ? `${name} · ${count}` : String(count);
        return {kind: "raid", title: "Raid", body};
    }
    if (type === "channel.cheer") {
        const name = asString(event.user_name).trim();
        const bits = finiteNumber(event.bits);
        const body = bits === null ? name : name ? `${name} ${bits}` : String(bits);
        return {kind: "bits", title: "Bits", body};
    }
    return null;
}

async function readEventsubSecret(): Promise<string> {
    try {
        return (await readFile(restreamEventsubSecretFile(), "utf8")).trim();
    } catch {
        return "";
    }
}

async function ensureEventsubSecretFile(): Promise<string> {
    const existing = await readEventsubSecret();
    if (existing) {
        return existing;
    }
    const secret = randomBytes(32).toString("hex");
    const file = restreamEventsubSecretFile();
    await atomicWriteFile(file, `${secret}\n`);
    await chmod(restreamDir(), 0o700).catch(() => undefined);
    await chmod(file, 0o600);
    return secret;
}

function headerValue(headers: Headers, name: string): string {
    return headers.get(name)?.trim() ?? "";
}

function parseJsonBody(rawBody: string): unknown {
    try {
        return JSON.parse(rawBody) as unknown;
    } catch {
        return null;
    }
}

/** Public webhook — HMAC only; admin is unused. */
export async function eventsubNotificationResponse(
    rawBody: string,
    headers: Headers,
    _options: {admin: boolean},
): Promise<Response> {
    const secret = await readEventsubSecret();
    const messageId = headerValue(headers, "Twitch-Eventsub-Message-Id");
    const timestamp = headerValue(headers, "Twitch-Eventsub-Message-Timestamp");
    const signature = headerValue(headers, "Twitch-Eventsub-Message-Signature");
    const messageType = headerValue(headers, "Twitch-Eventsub-Message-Type");
    if (
        !secret ||
        !verifyEventsubSignature({
            secret,
            messageId,
            timestamp,
            body: rawBody,
            signature,
        })
    ) {
        return forbidden();
    }

    if (messageType === "webhook_callback_verification") {
        const parsed = parseJsonBody(rawBody);
        const challenge = isRecord(parsed) ? asString(parsed.challenge) : "";
        if (!challenge) {
            return forbidden();
        }
        return noStore(200, challenge, "text/plain; charset=utf-8");
    }

    if (messageType === "revocation") {
        return noContent();
    }

    if (messageType !== "notification") {
        return noContent();
    }

    const parsed = parseJsonBody(rawBody);
    if (!isRecord(parsed)) {
        return noContent();
    }
    const subscription = isRecord(parsed.subscription) ? parsed.subscription : null;
    const type = subscription ? asString(subscription.type).trim() : "";
    const mapped = mapEventsubNotification(type, parsed.event);
    if (mapped) {
        publishOverlayAlert(
            {
                ...mapped,
                id: messageId,
                createdAt: Date.now(),
            },
            await readAlertsSettings(),
        );
    }
    return noContent();
}

function eventsubVersion(type: EventsubType): string {
    return type === "channel.follow" ? "2" : "1";
}

function eventsubCondition(type: EventsubType, userId: string): Record<string, string> {
    if (type === "channel.follow") {
        return {broadcaster_user_id: userId, moderator_user_id: userId};
    }
    if (type === "channel.raid") {
        return {to_broadcaster_user_id: userId};
    }
    return {broadcaster_user_id: userId};
}

function eventsubCallbackUrl(origin: string): string | null {
    const trimmed = origin.trim();
    if (!trimmed) {
        return null;
    }
    try {
        return new URL("/api/twitch/eventsub", `${trimmed.replace(/\/$/, "")}/`).toString();
    } catch {
        return null;
    }
}

function helixAuthHeaders(clientId: string, appAccessToken: string): HeadersInit {
    return {
        "Client-Id": clientId,
        Authorization: `Bearer ${appAccessToken}`,
    };
}

async function fetchEventsubAppAccessToken(
    env: NodeJS.ProcessEnv,
    fetcher: typeof fetch,
): Promise<{clientId: string; accessToken: string} | null> {
    const clientId = env.TWITCH_CLIENT_ID?.trim() ?? "";
    const clientSecret = env.TWITCH_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) {
        logEventsubFailed({reason: "missing_credentials"});
        return null;
    }
    try {
        const tokenResponse = await fetcher(TOKEN_URL, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: "client_credentials",
            }),
            signal: AbortSignal.timeout(EVENTSUB_TIMEOUT_MS),
        });
        if (!tokenResponse.ok) {
            logEventsubFailed({reason: "token_http", status: tokenResponse.status});
            return null;
        }
        const tokenBody: unknown = await tokenResponse.json();
        const accessToken = isRecord(tokenBody) ? asString(tokenBody.access_token).trim() : "";
        if (!accessToken) {
            logEventsubFailed({reason: "token_missing"});
            return null;
        }
        return {clientId, accessToken};
    } catch (error) {
        logEventsubFailed({reason: "request_failed", err: sanitizeError(error)});
        return null;
    }
}

function conditionMatches(
    condition: unknown,
    type: EventsubType,
    userId: string,
): boolean {
    if (!isRecord(condition)) {
        return false;
    }
    const expected = eventsubCondition(type, userId);
    for (const [key, value] of Object.entries(expected)) {
        if (asString(condition[key]).trim() !== value) {
            return false;
        }
    }
    return true;
}

type HelixAuth = {clientId: string; accessToken: string};

async function createEventsubSubscription(
    input: {
        type: EventsubType;
        userId: string;
        callback: string;
        secret: string;
        auth: HelixAuth;
    },
    fetcher: typeof fetch,
): Promise<Response> {
    return fetcher(EVENTSUB_SUBSCRIPTIONS_URL, {
        method: "POST",
        headers: {
            ...helixAuthHeaders(input.auth.clientId, input.auth.accessToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            type: input.type,
            version: eventsubVersion(input.type),
            condition: eventsubCondition(input.type, input.userId),
            transport: {
                method: "webhook",
                callback: input.callback,
                secret: input.secret,
            },
        }),
        signal: AbortSignal.timeout(EVENTSUB_TIMEOUT_MS),
    });
}

type ListedSubscription = {
    id: string;
    type: string;
    callback: string;
    condition: unknown;
};

async function listEventsubSubscriptions(
    type: EventsubType,
    auth: HelixAuth,
    fetcher: typeof fetch,
): Promise<ListedSubscription[]> {
    const found: ListedSubscription[] = [];
    let cursor = "";
    for (;;) {
        const url = new URL(EVENTSUB_SUBSCRIPTIONS_URL);
        url.searchParams.set("type", type);
        if (cursor) {
            url.searchParams.set("after", cursor);
        }
        const response = await fetcher(url.toString(), {
            method: "GET",
            headers: helixAuthHeaders(auth.clientId, auth.accessToken),
            signal: AbortSignal.timeout(EVENTSUB_TIMEOUT_MS),
        });
        if (!response.ok) {
            logEventsubFailed({reason: "list_http", type, status: response.status});
            break;
        }
        const body: unknown = await response.json();
        if (isRecord(body) && Array.isArray(body.data)) {
            for (const row of body.data) {
                if (!isRecord(row)) {
                    continue;
                }
                const id = asString(row.id).trim();
                if (!id) {
                    continue;
                }
                const transport = isRecord(row.transport) ? row.transport : null;
                found.push({
                    id,
                    type: asString(row.type).trim(),
                    callback: transport ? asString(transport.callback).trim() : "",
                    condition: row.condition,
                });
            }
        }
        const next =
            isRecord(body) && isRecord(body.pagination)
                ? asString(body.pagination.cursor).trim()
                : "";
        if (!next) {
            break;
        }
        cursor = next;
    }
    return found;
}

function matchingSubscriptions(
    existing: ListedSubscription[],
    type: EventsubType,
    userId: string,
): ListedSubscription[] {
    return existing.filter(
        (sub) => sub.type === type && conditionMatches(sub.condition, type, userId),
    );
}

async function deleteEventsubSubscription(
    id: string,
    auth: HelixAuth,
    fetcher: typeof fetch,
): Promise<void> {
    const url = new URL(EVENTSUB_SUBSCRIPTIONS_URL);
    url.searchParams.set("id", id);
    const response = await fetcher(url.toString(), {
        method: "DELETE",
        headers: helixAuthHeaders(auth.clientId, auth.accessToken),
        signal: AbortSignal.timeout(EVENTSUB_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 404) {
        logEventsubFailed({reason: "delete_http", status: response.status});
    }
}

async function replaceConflictingSubscriptions(
    type: EventsubType,
    userId: string,
    auth: HelixAuth,
    fetcher: typeof fetch,
): Promise<void> {
    const existing = await listEventsubSubscriptions(type, auth, fetcher);
    for (const sub of matchingSubscriptions(existing, type, userId)) {
        // GET omits the webhook secret, so matching type+condition is always replaced.
        await deleteEventsubSubscription(sub.id, auth, fetcher);
    }
}

async function remainingCallbackMatches(
    type: EventsubType,
    userId: string,
    callback: string,
    auth: HelixAuth,
    fetcher: typeof fetch,
): Promise<boolean> {
    const existing = await listEventsubSubscriptions(type, auth, fetcher);
    return matchingSubscriptions(existing, type, userId).some(
        (sub) => sub.callback === callback,
    );
}

function eventsubPublicOrigin(env: NodeJS.ProcessEnv): string | null {
    const configured = (env.GROWCAST_PUBLIC_URL ?? "").trim();
    if (!configured) {
        return null;
    }
    try {
        return new URL(configured).origin;
    } catch {
        return null;
    }
}

/** Renew EventSub webhooks on Node boot when a public origin and OAuth tokens exist. */
export async function ensureEventsubSubscriptionsOnBoot(
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
): Promise<void> {
    try {
        const origin = eventsubPublicOrigin(env);
        if (!origin) {
            if ((env.GROWCAST_PUBLIC_URL ?? "").trim()) {
                logEventsubFailed({reason: "invalid_origin"});
            }
            return;
        }
        if (!(await readTwitchOAuthFile())) {
            return;
        }
        await ensureEventsubSubscriptions(origin, env, fetcher, {replaceConflicts: false});
    } catch (error) {
        logEventsubFailed({reason: "boot_failed", err: sanitizeError(error)});
    }
}

export async function ensureEventsubSubscriptions(
    origin: string,
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
    options: {replaceConflicts?: boolean} = {},
): Promise<void> {
    const replaceConflicts = options.replaceConflicts !== false;
    try {
        const secret = await ensureEventsubSecretFile();
        const oauth = await readTwitchOAuthFile();
        if (!oauth) {
            return;
        }
        const callback = eventsubCallbackUrl(origin);
        if (!callback) {
            logEventsubFailed({reason: "invalid_origin"});
            return;
        }
        const auth = await fetchEventsubAppAccessToken(env, fetcher);
        if (!auth) {
            return;
        }

        for (const type of EVENTSUB_TYPES) {
            try {
                if (!replaceConflicts) {
                    const existing = await listEventsubSubscriptions(type, auth, fetcher);
                    if (
                        matchingSubscriptions(existing, type, oauth.userId).some(
                            (sub) => sub.callback === callback,
                        )
                    ) {
                        continue;
                    }
                }
                const created = await createEventsubSubscription(
                    {type, userId: oauth.userId, callback, secret, auth},
                    fetcher,
                );
                if (created.ok) {
                    continue;
                }
                if (created.status !== 409) {
                    logEventsubFailed({reason: "subscribe_http", type, status: created.status});
                    continue;
                }
                if (!replaceConflicts) {
                    if (
                        await remainingCallbackMatches(
                            type,
                            oauth.userId,
                            callback,
                            auth,
                            fetcher,
                        )
                    ) {
                        continue;
                    }
                    logEventsubFailed({reason: "subscribe_http", type, status: created.status});
                    continue;
                }
                await replaceConflictingSubscriptions(type, oauth.userId, auth, fetcher);
                const retried = await createEventsubSubscription(
                    {type, userId: oauth.userId, callback, secret, auth},
                    fetcher,
                );
                if (retried.ok) {
                    continue;
                }
                if (
                    retried.status === 409 &&
                    (await remainingCallbackMatches(
                        type,
                        oauth.userId,
                        callback,
                        auth,
                        fetcher,
                    ))
                ) {
                    continue;
                }
                logEventsubFailed({reason: "subscribe_http", type, status: retried.status});
            } catch (error) {
                logEventsubFailed({
                    reason: "request_failed",
                    type,
                    err: sanitizeError(error),
                });
            }
        }
    } catch (error) {
        logEventsubFailed({reason: "request_failed", err: sanitizeError(error)});
    }
}
