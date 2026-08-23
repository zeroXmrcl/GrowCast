import {isAdminAuthenticated} from "@/lib/admin-auth";
import {energyGetResponse} from "@/lib/energy/http";
import {withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
    return withRequestLog(request, "/api/data/energy", async () => {
        const isAdmin = await isAdminAuthenticated();
        return energyGetResponse(request, isAdmin ? "private" : "public");
    });
}
