import {requireMeshAuth} from "@/lib/mesh-auth";
import {
    getTimelapseSettingsRecord,
    isKnownMeshPlugin,
} from "@/lib/timelapse-settings";
import {logMeshPluginUnknown, withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PluginSettingsRouteContext = {
    params: Promise<{
        pluginId: string;
    }>;
};

export async function GET(request: Request, {params}: PluginSettingsRouteContext) {
    return withRequestLog(request, "/api/mesh/:pluginId", async () => {
        const authResponse = requireMeshAuth(request);

        if (authResponse) {
            return authResponse;
        }

        const {pluginId} = await params;

        if (!isKnownMeshPlugin(pluginId)) {
            logMeshPluginUnknown({plugin_id: pluginId});
            return Response.json(
                {error: "Unknown plugin"},
                {
                    status: 404,
                    headers: {
                        "Cache-Control": "no-store",
                    },
                },
            );
        }

        const data = await getTimelapseSettingsRecord();

        return Response.json(data, {
            headers: {
                "Cache-Control": "no-store, must-revalidate",
            },
        });
    });
}
