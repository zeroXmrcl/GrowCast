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

export async function ensureEventsubSubscriptions(
    origin: string,
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
): Promise<void> {
    try {
        const secret = await ensureEventsubSecretFile();
        const oauth = await readTwitchOAuthFile();
        if (!oauth) {
            return;
        }
        const clientId = env.TWITCH_CLIENT_ID?.trim() ?? "";
        if (!clientId) {
            logEventsubFailed({reason: "missing_credentials"});
            return;
        }
        const callback = eventsubCallbackUrl(origin);
        if (!callback) {
            logEventsubFailed({reason: "invalid_origin"});
            return;
        }

        for (const type of EVENTSUB_TYPES) {
            try {
                const response = await fetcher(EVENTSUB_SUBSCRIPTIONS_URL, {
                    method: "POST",
                    headers: {
                        "Client-Id": clientId,
                        Authorization: `Bearer ${oauth.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        type,
                        version: eventsubVersion(type),
                        condition: eventsubCondition(type, oauth.userId),
                        transport: {
                            method: "webhook",
                            callback,
                            secret,
                        },
                    }),
                    signal: AbortSignal.timeout(EVENTSUB_TIMEOUT_MS),
                });
                if (!response.ok && response.status !== 409) {
                    logEventsubFailed({reason: "subscribe_http", type, status: response.status});
                }
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
