import {cookies, headers} from "next/headers";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withNotice} from "@/lib/admin/notice";
import {safeEqualText} from "@/lib/crypto-equal";
import {sanitizeError, withRequestLog} from "@/lib/logging";
import {childLogger} from "@/lib/logging/logger";
import {shouldUseSecureCookie} from "@/lib/request-trust";
import {exchangeTwitchCode, writeTwitchOAuthFile} from "@/lib/restream/twitch-oauth";
import {shareCardMetadataOrigin} from "@/lib/share-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    return found(withNotice("/admin/stream", "twitch_oauth_failed"));
}

export async function GET(request: Request) {
    return withRequestLog(request, "/admin/stream/twitch-callback", async () => {
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

        const redirectUri = new URL(
            "/admin/stream/twitch-callback",
            shareCardMetadataOrigin(headerList) + "/",
        ).toString();

        try {
            const tokens = await exchangeTwitchCode(code, redirectUri);
            if (!tokens) {
                return oauthFailed();
            }
            await writeTwitchOAuthFile(tokens);
            return found(withNotice("/admin/stream", "twitch_connected"));
        } catch (error) {
            childLogger().warn({
                event: "twitch.oauth.failed",
                reason: "callback_failed",
                err: sanitizeError(error),
            });
            return oauthFailed();
        }
    });
}
