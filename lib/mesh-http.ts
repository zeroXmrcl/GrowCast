import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {loadHostModule} from "@/lib/plugins/first-party";
import {requireMeshAuthThrottled} from "@/lib/mesh-throttle";
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

    const discovered = await findDiscoveredPlugin(pluginId);
    const compat = discovered?.manifest.compat;
    if (!discovered || !(compat?.meshSettings || compat?.meshState)) {
        logMeshPluginUnknown({plugin_id: pluginId});
        return noStoreJson({error: "Unknown plugin"}, 404);
    }

    const host = await loadHostModule(discovered);
    if (host?.meshSettings) {
        try {
            const data = await host.meshSettings();
            return noStoreJson(data);
        } catch {
            return noStoreJson({error: "Unavailable"}, 503);
        }
    }

    return noStoreJson({
        pluginId: discovered.manifest.id,
        settingsVersion: new Date(0).toISOString(),
        settings: {},
    });
}
