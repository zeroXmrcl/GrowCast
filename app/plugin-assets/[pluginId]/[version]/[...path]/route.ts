import {readFile} from "node:fs/promises";
import {resolvePluginAsset} from "@/lib/plugins/assets";
import {pluginAssetCacheControl} from "@/lib/plugins/import-map";

export const dynamic = "force-dynamic";

function contentType(filePath: string): string {
    if (filePath.endsWith(".js")) {
        return "text/javascript; charset=utf-8";
    }
    if (filePath.endsWith(".css")) {
        return "text/css; charset=utf-8";
    }
    if (filePath.endsWith(".json")) {
        return "application/json; charset=utf-8";
    }
    return "application/octet-stream";
}

export async function GET(
    _request: Request,
    context: {params: Promise<{pluginId: string; version: string; path: string[]}>},
): Promise<Response> {
    const {pluginId, version, path} = await context.params;
    const relative = path.join("/");
    const abs = await resolvePluginAsset(pluginId, relative);
    if (!abs) {
        return new Response("Not found", {status: 404});
    }
    try {
        const body = await readFile(abs);
        return new Response(body, {
            headers: {
                "Content-Type": contentType(abs),
                "Cache-Control": pluginAssetCacheControl(version),
            },
        });
    } catch {
        return new Response("Not found", {status: 404});
    }
}
