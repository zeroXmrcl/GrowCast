import {isAdminAuthenticated} from "@/lib/admin-auth";
import {pluginNoticeMap} from "@/lib/plugins/notices";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!(await isAdminAuthenticated())) {
        return Response.json({error: "Unauthorized"}, {status: 401, headers: {"Cache-Control": "no-store"}});
    }
    return Response.json(await pluginNoticeMap(), {headers: {"Cache-Control": "no-store"}});
}
