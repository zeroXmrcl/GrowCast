import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withRequestLog} from "@/lib/logging";
import {programAlertsSseResponse} from "@/lib/overlay-alert-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
    return withRequestLog(request, "/api/overlay/program-alerts", async () => {
        const admin = await isAdminAuthenticated();
        return programAlertsSseResponse(request, {admin});
    });
}
