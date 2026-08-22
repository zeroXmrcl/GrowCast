import {requireMeshAuth} from "@/lib/mesh-auth";
import {GGS_PLUGIN_ID, TIMELAPSE_PLUGIN_ID, isKnownMeshPlugin} from "@/lib/mesh-plugins";
import {getTimelapseSettingsRecord} from "@/lib/timelapse-settings";
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

        if (pluginId === GGS_PLUGIN_ID) {
            return Response.json(
                {
                    pluginId: GGS_PLUGIN_ID,
                    settingsVersion: new Date(0).toISOString(),
                    settings: {},
                },
                {
                    headers: {
                        "Cache-Control": "no-store, must-revalidate",
                    },
                },
            );
        }

        if (pluginId !== TIMELAPSE_PLUGIN_ID) {
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
