import path from "node:path";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {getRegistryRecord, pluginIsActive} from "@/lib/plugins/registry";

export function isSafePluginAssetPath(relative: string): boolean {
    if (!relative || relative.includes("\0")) {
        return false;
    }
    const normalized = relative.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.includes("..")) {
        return false;
    }
    return normalized.startsWith("ui/dist/");
}

export async function resolvePluginAsset(pluginId: string, relative: string): Promise<string | null> {
    if (!isSafePluginAssetPath(relative)) {
        return null;
    }
    const record = await getRegistryRecord(pluginId);
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered || !record) {
        return null;
    }
    if (!pluginIsActive(record) && !(record.status === "enabled" && record.hashMatches)) {
        return null;
    }
    return path.join(discovered.folderPath, relative);
}
