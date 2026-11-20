import {withRequestLog} from "@/lib/logging";
import {legacyPluginPublicResponse} from "@/lib/plugins/legacy-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/** Public plugin webhook dispatcher. Provider HMAC lives in the plugin. */
export async function POST(request: Request) {
    return withRequestLog(request, "/api/twitch/eventsub", () => (
        legacyPluginPublicResponse(request, "/api/twitch/eventsub")
    ));
}
