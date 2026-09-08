import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withRequestLog} from "@/lib/logging";
import {programCameraGetResponse} from "@/lib/restream/program-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    return withRequestLog(request, "/api/overlay/program-camera", async () => {
        const admin = await isAdminAuthenticated();
        return programCameraGetResponse(request, {admin});
    });
}
