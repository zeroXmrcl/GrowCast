import {pluginPublicDispatch} from "@/lib/plugins/http";

export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    context: {params: Promise<{pluginId: string; path: string[]}>},
): Promise<Response> {
    const {pluginId, path} = await context.params;
    return pluginPublicDispatch(request, pluginId, path.join("/"));
}

export async function POST(
    request: Request,
    context: {params: Promise<{pluginId: string; path: string[]}>},
): Promise<Response> {
    const {pluginId, path} = await context.params;
    return pluginPublicDispatch(request, pluginId, path.join("/"));
}
