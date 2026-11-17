import {pluginPublicDispatch} from "@/lib/plugins/http";
import {LEGACY_PUBLIC_DISPATCH} from "@/lib/plugins/legacy-redirects";

export async function legacyPluginPublicResponse(request: Request, legacyPath: string): Promise<Response> {
    const mapped = LEGACY_PUBLIC_DISPATCH[legacyPath];
    if (!mapped) {
        return Response.json({error: "Unknown legacy path"}, {status: 404, headers: {"Cache-Control": "no-store"}});
    }
    return pluginPublicDispatch(request, mapped.pluginId, mapped.remainder);
}
