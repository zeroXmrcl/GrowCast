import {isAdminAuthenticated} from "@/lib/admin-auth";
import {applyCameraLook} from "@/lib/admin/apply-camera-look";
import {logAuthzDenied, withRequestLog} from "@/lib/logging";
import {isSameOriginRequest} from "@/lib/same-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status: number): Response {
    return Response.json(body, {
        status,
        headers: {"Cache-Control": "no-store"},
    });
}

export async function POST(request: Request) {
    return withRequestLog(request, "/api/admin/camera-look", async () => {
        if (!isSameOriginRequest(request)) {
            return json({ok: false, reason: "cross_origin"}, 403);
        }
        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.camera_look"});
            return json({ok: false, reason: "unauthenticated"}, 401);
        }
        let raw: unknown;
        try {
            raw = await request.json();
        } catch {
            return json({ok: false, reason: "invalid_json"}, 400);
        }
        const result = await applyCameraLook(raw);
        if (!result.ok) {
            return json(result, 400);
        }
        return json(result, 200);
    });
}
