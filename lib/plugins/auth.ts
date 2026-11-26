import {getBearerToken, getMeshToken, isMeshTokenAuthorized} from "@/lib/mesh-auth";
import {isFirstPartyPluginId} from "@/lib/plugins/ids";
import {isPluginTokenAuthorized} from "@/lib/plugins/tokens";
import {getRegistryRecord, pluginExecutionError} from "@/lib/plugins/registry";

function unauthorized(): Response {
    return Response.json(
        {error: "Unauthorized"},
        {
            status: 401,
            headers: {
                "Cache-Control": "no-store",
                "WWW-Authenticate": 'Bearer realm="GrowCast Plugin"',
            },
        },
    );
}

export async function requirePluginToken(request: Request, pluginId: string): Promise<Response | null> {
    const record = await getRegistryRecord(pluginId);
    const blocked = pluginExecutionError(record);
    if (blocked) {
        return Response.json(
            {error: blocked},
            {status: 409, headers: {"Cache-Control": "no-store"}},
        );
    }
    const provided = getBearerToken(request);
    if (await isPluginTokenAuthorized(pluginId, provided)) {
        return null;
    }
    if (isFirstPartyPluginId(pluginId) && isMeshTokenAuthorized(getMeshToken(), provided)) {
        return null;
    }
    return unauthorized();
}
