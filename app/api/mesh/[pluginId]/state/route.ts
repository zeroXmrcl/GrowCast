import {liveClimateIngestResponse} from "@/lib/ggs-live-http";
import {withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type MeshStateRouteContext = {
    params: Promise<{
        pluginId: string;
    }>;
};

export async function POST(request: Request, {params}: MeshStateRouteContext) {
    return withRequestLog(request, "/api/mesh/:pluginId/state", async () => {
        const {pluginId} = await params;
        return liveClimateIngestResponse(request, pluginId);
    });
}
