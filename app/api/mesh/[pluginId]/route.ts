import {requireMeshAuth} from "@/lib/mesh-auth";
import {getPluginSettingsDefinition} from "@/lib/plugin-registry";
import {getPluginSettingsRecord} from "@/lib/plugin-settings-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PluginSettingsRouteContext = {
    params: Promise<{
        pluginId: string;
    }>;
};

export async function GET(request: Request, {params}: PluginSettingsRouteContext) {
    const authResponse = requireMeshAuth(request);

    if (authResponse) {
        return authResponse;
    }

    const {pluginId} = await params;
    const definition = getPluginSettingsDefinition(pluginId);

    if (!definition) {
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

    const data = await getPluginSettingsRecord(definition);

    return Response.json(data, {
        headers: {
            "Cache-Control": "no-store, must-revalidate",
        },
    });
}
