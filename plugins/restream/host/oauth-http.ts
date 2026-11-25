import {randomBytes} from "node:crypto";
import {cookies, headers} from "next/headers";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withNotice} from "@/lib/admin/notice";
import {safeEqualText} from "@/lib/crypto-equal";
import {sanitizeError} from "@/lib/logging";
import {childLogger} from "@/lib/logging/logger";
import {shouldUseSecureCookie} from "@/lib/request-trust";
import {shareCardMetadataOrigin} from "@/lib/share-card";
import {ensureEventsubSubscriptions} from "@/plugins/restream/host/eventsub";
import {buildTwitchAuthorizeUrl, exchangeTwitchCode, writeTwitchOAuthFile} from "@/plugins/restream/host/twitch-oauth";

function found(location: string): Response {
    return new Response(null, {
        status: 302,
        headers: {
            Location: location,
            "Cache-Control": "no-store",
        },
    });
}

function oauthFailed(): Response {
    return found(withNotice("/admin/plugins/growcast.restream", "twitch_oauth_failed"));
}

export async function twitchConnectResponse(): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return found("/admin");
    }
    const headerList = await headers();
    const clientId = process.env.TWITCH_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) {
        return found(withNotice("/admin/plugins/growcast.restream", "twitch_oauth_failed"));
    }
    const state = randomBytes(32).toString("hex");
    const redirectUri = new URL(
        "/admin/stream/twitch-callback",
        shareCardMetadataOrigin(headerList) + "/",
    ).toString();
    const cookieStore = await cookies();
    cookieStore.set("growcast_twitch_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        path: "/admin/stream/twitch-callback",
        maxAge: 600,
        secure: shouldUseSecureCookie(headerList),
    });
    return found(buildTwitchAuthorizeUrl({clientId, redirectUri, state}));
}

export async function twitchCallbackResponse(request: Request): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return found("/admin");
    }
    const headerList = await headers();
    const cookieStore = await cookies();
    const cookieState = cookieStore.get("growcast_twitch_oauth_state")?.value ?? "";
    cookieStore.delete({
        name: "growcast_twitch_oauth_state",
        path: "/admin/stream/twitch-callback",
        secure: shouldUseSecureCookie(headerList),
        sameSite: "lax",
    });
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (
        url.searchParams.get("error") ||
        !code ||
        !state ||
        !cookieState ||
        !safeEqualText(state, cookieState)
    ) {
        return oauthFailed();
    }
    const origin = shareCardMetadataOrigin(headerList);
    const redirectUri = new URL("/admin/stream/twitch-callback", origin + "/").toString();
    try {
        const tokens = await exchangeTwitchCode(code, redirectUri);
        if (!tokens) {
            return oauthFailed();
        }
        await writeTwitchOAuthFile(tokens);
    } catch (error) {
        childLogger().warn({
            event: "twitch.oauth.failed",
            reason: "callback_failed",
            err: sanitizeError(error),
        });
        return oauthFailed();
    }
    try {
        await ensureEventsubSubscriptions(origin);
    } catch (error) {
        childLogger().warn({
            event: "twitch.eventsub.failed",
            reason: "subscribe_failed",
            err: sanitizeError(error),
        });
    }
    return found(withNotice("/admin/plugins/growcast.restream", "twitch_connected"));
}
