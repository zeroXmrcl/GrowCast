import {withRequestLog} from "@/lib/logging";
import {legacyPluginPublicResponse} from "@/lib/plugins/legacy-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public plugin OAuth dispatcher. Provider logic lives in the plugin. */
export async function GET(request: Request) {
    return withRequestLog(request, "/admin/stream/twitch-callback", () => (
        legacyPluginPublicResponse(request, "/admin/stream/twitch-callback")
    ));
}
