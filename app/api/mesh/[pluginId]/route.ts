import {meshPluginGetResponse} from "@/lib/mesh-http";
import {withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PluginSettingsRouteContext = {
    params: Promise<{
        pluginId: string;
    }>;
};

export async function GET(request: Request, {params}: PluginSettingsRouteContext) {
    return withRequestLog(request, "/api/mesh/:pluginId", async () => {
        const {pluginId} = await params;
        return meshPluginGetResponse(request, pluginId);
    });
}
