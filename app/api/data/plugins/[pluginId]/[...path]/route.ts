import {pluginPublicDispatch} from "@/lib/plugins/http";
import {withServerTiming} from "@/lib/plugins/server-timing";

export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    context: {params: Promise<{pluginId: string; path: string[]}>},
): Promise<Response> {
    const started = performance.now();
    const {pluginId, path} = await context.params;
    const response = await pluginPublicDispatch(request, pluginId, path.join("/"));
    return withServerTiming(response, "plugin", started);
}

export async function POST(
    request: Request,
    context: {params: Promise<{pluginId: string; path: string[]}>},
): Promise<Response> {
    const started = performance.now();
    const {pluginId, path} = await context.params;
    const response = await pluginPublicDispatch(request, pluginId, path.join("/"));
    return withServerTiming(response, "plugin", started);
}
