import {getBearerToken, getMeshToken, isMeshTokenAuthorized} from "@/lib/mesh-auth";
import {isFirstPartyPluginId} from "@/lib/plugins/ids";
import {PLUGIN_FILES_CHANGED_ERROR} from "@/lib/plugins/messages";
import {isPluginTokenAuthorized} from "@/lib/plugins/tokens";
import {getRegistryRecord, pluginIsActive} from "@/lib/plugins/registry";

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
    if (record?.pinnedHash && record.hashMatches === false) {
        return Response.json(
            {error: PLUGIN_FILES_CHANGED_ERROR},
            {status: 409, headers: {"Cache-Control": "no-store"}},
        );
    }
    if (!pluginIsActive(record) && record?.status !== "enabled") {
        return Response.json({error: "Plugin is not enabled"}, {status: 409, headers: {"Cache-Control": "no-store"}});
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
