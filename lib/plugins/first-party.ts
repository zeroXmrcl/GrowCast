import path from "node:path";
import {pathToFileURL} from "node:url";
import type {DiscoveredPlugin, PluginHostModule} from "@/lib/plugins/types";

const cache = new Map<string, PluginHostModule | null>();

const BUNDLED: Record<string, () => Promise<PluginHostModule>> = {
    "growcast.solar": () => import("@/plugins/solar/host/index"),
    "growcast.ggs": () => import("@/plugins/ggs/host/index"),
    "growcast.timelapse": () => import("@/plugins/timelapse/host/index"),
    "growcast.restream": () => import("@/plugins/restream/host/index"),
};

export function _resetHostModuleCacheForTests(): void {
    cache.clear();
}

export async function loadHostModule(plugin: DiscoveredPlugin): Promise<PluginHostModule | null> {
    const cached = cache.get(plugin.manifest.id);
    if (cached !== undefined) {
        return cached;
    }
    const bundled = BUNDLED[plugin.manifest.id];
    if (bundled) {
        try {
            const loaded = await bundled();
            cache.set(plugin.manifest.id, loaded);
            return loaded;
        } catch {
            cache.set(plugin.manifest.id, null);
        }
    }
    const spec = plugin.manifest.hostModule;
    if (!spec) {
        cache.set(plugin.manifest.id, null);
        return null;
    }
    const abs = path.resolve(plugin.folderPath, spec);
    for (const candidate of [abs, `${abs}.ts`, `${abs}.js`]) {
        try {
            const loaded = await import(pathToFileURL(candidate).href) as PluginHostModule;
            cache.set(plugin.manifest.id, loaded);
            return loaded;
        } catch {
            continue;
        }
    }
    cache.set(plugin.manifest.id, null);
    return null;
}
