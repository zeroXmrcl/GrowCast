import {randomBytes} from "node:crypto";
import {cookies, headers} from "next/headers";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withNotice} from "@/lib/admin/notice";
import {withRequestLog} from "@/lib/logging";
import {shouldUseSecureCookie} from "@/lib/request-trust";
import {buildTwitchAuthorizeUrl} from "@/lib/restream/twitch-oauth";
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

export async function GET(request: Request) {
    return withRequestLog(request, "/admin/stream/twitch-connect", async () => {
        if (!(await isAdminAuthenticated())) {
            return found("/admin");
        }

        const headerList = await headers();
        const clientId = process.env.TWITCH_CLIENT_ID?.trim() ?? "";
        const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim() ?? "";
        if (!clientId || !clientSecret) {
            return found(withNotice("/admin/stream", "twitch_oauth_failed"));
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
    });
}
