import {isAdminAuthenticated} from "@/lib/admin-auth";
import {applyProgramAlert} from "@/lib/admin/apply-program-alert";
import {logAuthzDenied, withRequestLog} from "@/lib/logging";
import {isSameOriginRequest} from "@/lib/same-origin";
import {asString, isRecord} from "@/lib/coerce";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status: number): Response {
    return Response.json(body, {
        status,
        headers: {"Cache-Control": "no-store"},
    });
}

export async function POST(request: Request) {
    return withRequestLog(request, "/api/admin/program-alert", async () => {
        if (!isSameOriginRequest(request)) {
            return json({ok: false, reason: "cross_origin"}, 403);
        }
        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.program_alert"});
            return json({ok: false, reason: "unauthenticated"}, 401);
        }

        let raw: unknown;
        try {
            raw = await request.json();
        } catch {
            return json({ok: false, reason: "invalid_json"}, 400);
        }
        const alertBody = isRecord(raw) ? asString(raw.alertBody) : "";
        const result = await applyProgramAlert(alertBody);
        if (!result.ok) {
            return json(result, 400);
        }
        return json(result, 200);
    });
}
