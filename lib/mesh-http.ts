import {isRecord} from "@/lib/coerce";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {loadHostModule} from "@/lib/plugins/first-party";
import {ingestPluginPayload} from "@/lib/plugins/ingest";
import {getRegistryRecord, pluginExecutionError, pluginMayExecute} from "@/lib/plugins/registry";
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
    const record = await getRegistryRecord(pluginId);
    const compat = discovered?.manifest.compat;
    if (!discovered || !(compat?.meshSettings || compat?.meshState)) {
        logMeshPluginUnknown({plugin_id: pluginId});
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const blocked = pluginExecutionError(record);
    if (!record || blocked || !pluginMayExecute(record)) {
        return noStoreJson({error: blocked ?? "Plugin is not enabled"}, 409);
    }

    const host = await loadHostModule(discovered, record.currentHash);
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

export async function meshPluginStatePostResponse(
    request: Request,
    pluginId: string,
): Promise<Response> {
    const auth = requireMeshAuthThrottled(request);
    if (auth) {
        return auth;
    }

    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered?.manifest.compat?.meshState) {
        logMeshPluginUnknown({plugin_id: pluginId});
        return noStoreJson({error: "Unknown plugin"}, 404);
    }

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return noStoreJson({error: "Invalid JSON"}, 400);
    }

    const record = await getRegistryRecord(pluginId);
    const blocked = pluginExecutionError(record);
    if (!record || blocked || !pluginMayExecute(record)) {
        return noStoreJson({error: blocked ?? "Plugin is not enabled"}, 409);
    }

    const host = await loadHostModule(discovered, record.currentHash);
    if (host?.fromMeshState) {
        const mapped = host.fromMeshState(raw);
        if ("error" in mapped) {
            return noStoreJson({error: "Invalid body"}, 400);
        }
        if (host.onIngest) {
            const observedAt = typeof mapped.observedAt === "string"
                ? mapped.observedAt
                : new Date().toISOString();
            const state = isRecord(mapped.state) ? mapped.state : null;
            await host.onIngest({
                pluginId,
                observedAt,
                metrics: {},
                state,
            });
            return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
        }
    }

    const result = await ingestPluginPayload(pluginId, raw);
    if (result.ok) {
        return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
    }
    return noStoreJson({error: result.error}, result.status);
}
