import {asString, isRecord} from "@/lib/coerce";
import {sanitizeError} from "@/lib/logging/redact";
import {childLogger} from "@/lib/logging/logger";
import {isTwitchLogin} from "@/lib/restream/broadcast";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";
const HELIX_TIMEOUT_MS = 8_000;

export function twitchUserIdFromStreamKey(key: string): string | null {
    const match = key.trim().match(/^live_(\d+)_/);
    return match?.[1] ?? null;
}

export function streamKeyForChannelLookup(submittedKey: string, persistedKey: string): string {
    const submitted = submittedKey.trim();
    return submitted.length > 0 ? submitted : persistedKey.trim();
}

export function isInvalidTypedChannelLogin(typedLogin: string, previousLogin: string): boolean {
    const typed = typedLogin.trim();
    const previous = previousLogin.trim();
    return typed.length > 0 && typed !== previous && !isTwitchLogin(typed);
}

function helixCredentials(env: NodeJS.ProcessEnv): {clientId: string; clientSecret: string} | null {
    const clientId = env.TWITCH_CLIENT_ID?.trim() ?? "";
    const clientSecret = env.TWITCH_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) {
        return null;
    }
    return {clientId, clientSecret};
}

function logHelixFailed(fields: Record<string, unknown>): void {
    childLogger().warn({event: "twitch.helix.failed", ...fields});
}

function loginFromUsersBody(raw: unknown): string | null {
    if (!isRecord(raw) || !Array.isArray(raw.data) || !isRecord(raw.data[0])) {
        return null;
    }
    const login = asString(raw.data[0].login).trim();
    return isTwitchLogin(login) ? login : null;
}

export async function fetchTwitchLoginForUserId(
    userId: string,
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
): Promise<string | null> {
    const creds = helixCredentials(env);
    if (!creds) {
        logHelixFailed({reason: "missing_credentials"});
        return null;
    }

    try {
        const tokenResponse = await fetcher(TOKEN_URL, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                grant_type: "client_credentials",
            }),
            signal: AbortSignal.timeout(HELIX_TIMEOUT_MS),
        });
        if (!tokenResponse.ok) {
            logHelixFailed({reason: "token_http", status: tokenResponse.status});
            return null;
        }
        const tokenBody: unknown = await tokenResponse.json();
        const accessToken = isRecord(tokenBody) ? asString(tokenBody.access_token).trim() : "";
        if (!accessToken) {
            logHelixFailed({reason: "token_missing"});
            return null;
        }

        const usersUrl = `${USERS_URL}?id=${encodeURIComponent(userId)}`;
        const usersResponse = await fetcher(usersUrl, {
            headers: {
                "Client-Id": creds.clientId,
                Authorization: `Bearer ${accessToken}`,
            },
            signal: AbortSignal.timeout(HELIX_TIMEOUT_MS),
        });
        if (!usersResponse.ok) {
            logHelixFailed({reason: "users_http", status: usersResponse.status});
            return null;
        }
        const login = loginFromUsersBody(await usersResponse.json());
        if (!login) {
            logHelixFailed({reason: "users_empty"});
            return null;
        }
        return login;
    } catch (error) {
        logHelixFailed({reason: "request_failed", err: sanitizeError(error)});
        return null;
    }
}

export async function resolveChannelLogin(
    input: {
        typedLogin: string;
        streamKey: string;
        previousLogin: string;
    },
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
): Promise<string> {
    const typed = input.typedLogin.trim();
    const previous = input.previousLogin.trim();
    if (typed.length > 0 && isTwitchLogin(typed)) {
        return typed;
    }
    const userId = twitchUserIdFromStreamKey(input.streamKey);
    if (!userId) {
        return previous;
    }
    const helixLogin = await fetchTwitchLoginForUserId(userId, env, fetcher);
    return helixLogin ?? previous;
}
