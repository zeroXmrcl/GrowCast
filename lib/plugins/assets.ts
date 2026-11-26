import {containedPluginPath} from "@/lib/plugins/containment";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {getRegistryRecord, pluginMayExecute} from "@/lib/plugins/registry";

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
    if (!pluginMayExecute(record)) {
        return null;
    }
    return containedPluginPath(discovered.folderPath, relative);
}
