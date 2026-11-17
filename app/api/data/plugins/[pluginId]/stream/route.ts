import {pluginPublicStreamResponse} from "@/lib/plugins/http";

export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    context: {params: Promise<{pluginId: string}>},
): Promise<Response> {
    const {pluginId} = await context.params;
    return pluginPublicStreamResponse(request, pluginId);
}
