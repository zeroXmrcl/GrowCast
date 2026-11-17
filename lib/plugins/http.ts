import {isAdminAuthenticated} from "@/lib/admin-auth";
import {readPluginConfig, readPluginConfigForBackend, stripSecrets, writePluginConfig} from "@/lib/plugins/config";
import {findDiscoveredPlugin, resolveDiscoveredPluginId} from "@/lib/plugins/discovery";
import {requirePluginToken} from "@/lib/plugins/auth";
import {recordPluginHeartbeat} from "@/lib/plugins/heartbeat";
import {ingestPluginPayload} from "@/lib/plugins/ingest";
import {loadHostModule} from "@/lib/plugins/first-party";
import {getRegistryRecord, pluginIsActive} from "@/lib/plugins/registry";
import {pluginLiveSseResponse} from "@/lib/plugins/sse";
import {readPluginLive, readPluginSeries} from "@/lib/plugins/store";
import {pluginDateOnly, pluginDateWindow} from "@/lib/plugins/windows";

function noStoreJson(body: unknown, status = 200): Response {
    return Response.json(body, {
        status,
        headers: {"Cache-Control": "no-store"},
    });
}

async function parseJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

export async function pluginConfigGetResponse(request: Request, pluginId: string): Promise<Response> {
    const auth = await requirePluginToken(request, pluginId);
    if (auth) {
        return auth;
    }
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const values = await readPluginConfigForBackend(pluginId);
    return noStoreJson({pluginId, config: values});
}

export async function pluginAdminConfigGetResponse(pluginId: string): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return noStoreJson({error: "Unauthorized"}, 401);
    }
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const values = await readPluginConfig(pluginId);
    return noStoreJson({
        pluginId,
        config: stripSecrets(discovered.manifest, values),
        fields: discovered.manifest.config,
    });
}

export async function pluginAdminConfigPostResponse(request: Request, pluginId: string): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return noStoreJson({error: "Unauthorized"}, 401);
    }
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const body = await parseJson(request);
    try {
        await writePluginConfig(pluginId, discovered.manifest, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
        return noStoreJson({error: error instanceof Error ? error.message : "Invalid config"}, 422);
    }
    return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
}

export async function pluginIngestPostResponse(request: Request, pluginId: string): Promise<Response> {
    const auth = await requirePluginToken(request, pluginId);
    if (auth) {
        return auth;
    }
    const body = await parseJson(request);
    const result = await ingestPluginPayload(pluginId, body);
    if (result.ok) {
        return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
    }
    return noStoreJson({error: result.error}, result.status);
}

export async function pluginHeartbeatPostResponse(request: Request, pluginId: string): Promise<Response> {
    const auth = await requirePluginToken(request, pluginId);
    if (auth) {
        return auth;
    }
    const body = await parseJson(request);
    const result = await recordPluginHeartbeat(pluginId, body ?? {});
    if (!result.ok) {
        return noStoreJson({error: result.error}, 422);
    }
    return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
}

export async function pluginPublicGetResponse(pluginIdParam: string): Promise<Response> {
    const pluginId = (await resolveDiscoveredPluginId(pluginIdParam)) ?? pluginIdParam;
    const record = await getRegistryRecord(pluginId);
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered || !pluginIsActive(record)) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const live = await readPluginLive(pluginId);
    return Response.json(live, {headers: {"Cache-Control": "no-store, must-revalidate"}});
}

export async function pluginPublicStreamResponse(request: Request, pluginIdParam: string): Promise<Response> {
    const pluginId = (await resolveDiscoveredPluginId(pluginIdParam)) ?? pluginIdParam;
    const record = await getRegistryRecord(pluginId);
    if (!pluginIsActive(record)) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    return pluginLiveSseResponse(pluginId, request);
}

export async function pluginPublicDispatch(
    request: Request,
    pluginIdParam: string,
    remainder: string,
): Promise<Response> {
    const pluginId = (await resolveDiscoveredPluginId(pluginIdParam)) ?? pluginIdParam;
    const discovered = await findDiscoveredPlugin(pluginId);
    const record = await getRegistryRecord(pluginId);
    if (!discovered || !pluginIsActive(record)) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const host = await loadHostModule(discovered);
    if (host?.handlePublic) {
        return host.handlePublic(request, remainder);
    }
    return noStoreJson({error: "Plugin has no public handler"}, 404);
}

export async function pluginSeriesGetResponse(pluginId: string, keys: string[], window: string): Promise<Response> {
    const record = await getRegistryRecord(pluginId);
    if (!pluginIsActive(record)) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const today = pluginDateOnly(Date.now());
    const days = window === "30d" ? pluginDateWindow(today, 30)
        : window === "7d" ? pluginDateWindow(today, 7)
            : [today];
    const series = await readPluginSeries(pluginId, keys, days);
    return noStoreJson({pluginId, window, series});
}

export async function pluginProxyResponse(
    request: Request,
    pluginIdParam: string,
    remainder: string,
): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return noStoreJson({error: "Unauthorized"}, 401);
    }
    const pluginId = (await resolveDiscoveredPluginId(pluginIdParam)) ?? pluginIdParam;
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        return noStoreJson({error: "Unknown plugin"}, 404);
    }
    const host = await loadHostModule(discovered);
    if (host?.handleAction) {
        return host.handleAction(request, remainder);
    }
    return noStoreJson({error: "Plugin has no action handler"}, 404);
}
