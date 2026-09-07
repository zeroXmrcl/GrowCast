import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withRequestLog} from "@/lib/logging";
import {programAudioGetResponse} from "@/lib/restream/program-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    return withRequestLog(request, "/api/overlay/program-audio", async () => {
        const admin = await isAdminAuthenticated();
        return programAudioGetResponse(request, {admin});
    });
}
