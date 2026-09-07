import {chmod, readFile} from "node:fs/promises";
import {asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {sanitizeError} from "@/lib/logging/redact";
import {childLogger} from "@/lib/logging/logger";
import {isTwitchLogin} from "@/lib/restream/broadcast";
import {restreamDir, restreamOAuthFile} from "@/lib/restream/paths";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";
const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const OAUTH_TIMEOUT_MS = 8_000;

export const TWITCH_OAUTH_SCOPES = [
    "moderator:read:followers",
    "channel:read:subscriptions",
    "bits:read",
] as const;

export type TwitchOAuthFile = {
    accessToken: string;
    refreshToken: string;
    userId: string;
    login: string;
};

function oauthCredentials(env: NodeJS.ProcessEnv): {clientId: string; clientSecret: string} | null {
    const clientId = env.TWITCH_CLIENT_ID?.trim() ?? "";
    const clientSecret = env.TWITCH_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) {
        return null;
    }
    return {clientId, clientSecret};
}

function logOAuthFailed(fields: Record<string, unknown>): void {
    childLogger().warn({event: "twitch.oauth.failed", ...fields});
}

export function parseTwitchOAuthFile(raw: unknown): TwitchOAuthFile | null {
    if (!isRecord(raw)) {
        return null;
    }
    const accessToken = asString(raw.accessToken).trim();
    const refreshToken = asString(raw.refreshToken).trim();
    const userId = asString(raw.userId).trim();
    const login = asString(raw.login).trim();
    if (!accessToken || !refreshToken || !userId || !isTwitchLogin(login)) {
        return null;
    }
    return {accessToken, refreshToken, userId, login};
}

export function buildTwitchAuthorizeUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
}): string {
    const params = new URLSearchParams({
        response_type: "code",
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        scope: TWITCH_OAUTH_SCOPES.join(" "),
        state: input.state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
}

function userFromHelixBody(raw: unknown): {userId: string; login: string} | null {
    if (!isRecord(raw) || !Array.isArray(raw.data) || !isRecord(raw.data[0])) {
        return null;
    }
    const userId = asString(raw.data[0].id).trim();
    const login = asString(raw.data[0].login).trim();
    if (!userId || !isTwitchLogin(login)) {
        return null;
    }
    return {userId, login};
}

async function helixUserForAccessToken(
    accessToken: string,
    clientId: string,
    fetcher: typeof fetch,
): Promise<{userId: string; login: string} | null> {
    const usersResponse = await fetcher(USERS_URL, {
        headers: {
            "Client-Id": clientId,
            Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
    if (!usersResponse.ok) {
        logOAuthFailed({reason: "users_http", status: usersResponse.status});
        return null;
    }
    const user = userFromHelixBody(await usersResponse.json());
    if (!user) {
        logOAuthFailed({reason: "users_empty"});
        return null;
    }
    return user;
}

export async function exchangeTwitchCode(
    code: string,
    redirectUri: string,
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
): Promise<TwitchOAuthFile | null> {
    const creds = oauthCredentials(env);
    if (!creds) {
        logOAuthFailed({reason: "missing_credentials"});
        return null;
    }
    const trimmedCode = code.trim();
    const trimmedRedirect = redirectUri.trim();
    if (!trimmedCode || !trimmedRedirect) {
        logOAuthFailed({reason: "invalid_request"});
        return null;
    }

    try {
        const tokenResponse = await fetcher(TOKEN_URL, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                code: trimmedCode,
                grant_type: "authorization_code",
                redirect_uri: trimmedRedirect,
            }),
            signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
        });
        if (!tokenResponse.ok) {
            logOAuthFailed({reason: "token_http", status: tokenResponse.status});
            return null;
        }
        const tokenBody: unknown = await tokenResponse.json();
        const accessToken = isRecord(tokenBody) ? asString(tokenBody.access_token).trim() : "";
        const refreshToken = isRecord(tokenBody) ? asString(tokenBody.refresh_token).trim() : "";
        if (!accessToken || !refreshToken) {
            logOAuthFailed({reason: "token_missing"});
            return null;
        }

        const user = await helixUserForAccessToken(accessToken, creds.clientId, fetcher);
        if (!user) {
            return null;
        }
        return parseTwitchOAuthFile({
            accessToken,
            refreshToken,
            userId: user.userId,
            login: user.login,
        });
    } catch (error) {
        logOAuthFailed({reason: "request_failed", err: sanitizeError(error)});
        return null;
    }
}

export async function refreshTwitchToken(
    current: TwitchOAuthFile,
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
): Promise<TwitchOAuthFile | null> {
    const parsed = parseTwitchOAuthFile(current);
    if (!parsed) {
        return null;
    }
    const creds = oauthCredentials(env);
    if (!creds) {
        logOAuthFailed({reason: "missing_credentials"});
        return null;
    }

    try {
        const tokenResponse = await fetcher(TOKEN_URL, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                grant_type: "refresh_token",
                refresh_token: parsed.refreshToken,
            }),
            signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
        });
        if (!tokenResponse.ok) {
            logOAuthFailed({reason: "token_http", status: tokenResponse.status});
            return null;
        }
        const tokenBody: unknown = await tokenResponse.json();
        const accessToken = isRecord(tokenBody) ? asString(tokenBody.access_token).trim() : "";
        const nextRefresh = isRecord(tokenBody) ? asString(tokenBody.refresh_token).trim() : "";
        if (!accessToken) {
            logOAuthFailed({reason: "token_missing"});
            return null;
        }
        return parseTwitchOAuthFile({
            accessToken,
            refreshToken: nextRefresh || parsed.refreshToken,
            userId: parsed.userId,
            login: parsed.login,
        });
    } catch (error) {
        logOAuthFailed({reason: "request_failed", err: sanitizeError(error)});
        return null;
    }
}

export async function readTwitchOAuthFile(): Promise<TwitchOAuthFile | null> {
    try {
        return parseTwitchOAuthFile(JSON.parse(await readFile(restreamOAuthFile(), "utf8")));
    } catch {
        return null;
    }
}

export async function writeTwitchOAuthFile(value: TwitchOAuthFile): Promise<void> {
    const parsed = parseTwitchOAuthFile(value);
    if (!parsed) {
        return;
    }
    await atomicWriteFile(restreamOAuthFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    await chmod(restreamDir(), 0o700).catch(() => undefined);
    await chmod(restreamOAuthFile(), 0o600);
}
