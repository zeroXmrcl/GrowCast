import {GGS_PLUGIN_ID, TIMELAPSE_PLUGIN_ID, isKnownMeshPlugin} from "@/lib/mesh-plugins";
import {requireMeshAuthThrottled} from "@/lib/mesh-throttle";
import {getTimelapseSettingsRecord} from "@/lib/timelapse-settings";
import {logMeshPluginUnknown} from "@/lib/logging/security-events";

function noStoreJson(body: unknown, status = 200): Response {
    return Response.json(body, {
        status,
        headers: {
            "Cache-Control": status === 200 ? "no-store, must-revalidate" : "no-store",
        },
    });
}

export async function meshPluginGetResponse(
    request: Request,
    pluginId: string,
): Promise<Response> {
    const auth = requireMeshAuthThrottled(request);
    if (auth) {
        return auth;
    }

    if (!isKnownMeshPlugin(pluginId)) {
        logMeshPluginUnknown({plugin_id: pluginId});
        return noStoreJson({error: "Unknown plugin"}, 404);
    }

    if (pluginId === GGS_PLUGIN_ID) {
        return noStoreJson({
            pluginId: GGS_PLUGIN_ID,
            settingsVersion: new Date(0).toISOString(),
            settings: {},
        });
    }

    if (pluginId !== TIMELAPSE_PLUGIN_ID) {
        logMeshPluginUnknown({plugin_id: pluginId});
        return noStoreJson({error: "Unknown plugin"}, 404);
    }

    try {
        const data = await getTimelapseSettingsRecord();
        return noStoreJson(data);
    } catch {
        return noStoreJson({error: "Unavailable"}, 503);
    }
}
