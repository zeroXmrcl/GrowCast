import {parseClimateHistoryBody} from "@/lib/climate/ingest";
import {mergeClimatePoints} from "@/lib/climate/store";
import {GGS_PLUGIN_ID} from "@/lib/ggs-live";
import {withRequestLog} from "@/lib/logging";
import {logMeshPluginUnknown} from "@/lib/logging/security-events";
import {requireMeshAuthThrottled} from "@/lib/mesh-throttle";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type HistoryRouteContext = {
    params: Promise<{pluginId: string}>;
};

export async function POST(request: Request, {params}: HistoryRouteContext) {
    return withRequestLog(request, "/api/mesh/:pluginId/history", async () => {
        const auth = requireMeshAuthThrottled(request);
        if (auth) {
            return auth;
        }
        const {pluginId} = await params;
        if (pluginId !== GGS_PLUGIN_ID) {
            logMeshPluginUnknown({plugin_id: pluginId});
            return Response.json({error: "Unknown plugin"}, {status: 404, headers: {"Cache-Control": "no-store"}});
        }
        let raw: unknown;
        try {
            raw = await request.json();
        } catch {
            return Response.json({error: "Invalid JSON"}, {status: 400, headers: {"Cache-Control": "no-store"}});
        }
        const parsed = parseClimateHistoryBody(raw);
        if (!parsed.ok) {
            return Response.json({error: "Invalid body"}, {status: 400, headers: {"Cache-Control": "no-store"}});
        }
        await mergeClimatePoints(parsed.points);
        return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
    });
}
