import {pluginHeartbeatPostResponse} from "@/lib/plugins/http";

export const dynamic = "force-dynamic";

export async function POST(
    request: Request,
    context: {params: Promise<{pluginId: string}>},
): Promise<Response> {
    const {pluginId} = await context.params;
    return pluginHeartbeatPostResponse(request, pluginId);
}
