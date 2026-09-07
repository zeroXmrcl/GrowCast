import {withRequestLog} from "@/lib/logging";
import {eventsubNotificationResponse} from "@/lib/restream/eventsub";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/** Public EventSub webhook — HMAC only, no admin session. */
export async function POST(request: Request) {
    return withRequestLog(request, "/api/twitch/eventsub", async () => {
        const rawBody = await request.text();
        return eventsubNotificationResponse(rawBody, request.headers, {admin: false});
    });
}
