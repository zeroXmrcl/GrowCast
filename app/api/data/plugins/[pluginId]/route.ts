import {pluginPublicGetResponse} from "@/lib/plugins/http";

export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    context: {params: Promise<{pluginId: string}>},
): Promise<Response> {
    const {pluginId} = await context.params;
    return pluginPublicGetResponse(pluginId);
}
