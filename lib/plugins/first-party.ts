import path from "node:path";
import {pathToFileURL} from "node:url";
import {pluginLogger} from "@/lib/plugins/log";
import type {DiscoveredPlugin, PluginHostModule} from "@/lib/plugins/types";

const cache = new Map<string, PluginHostModule | null>();

export function _resetHostModuleCacheForTests(): void {
    cache.clear();
}

function hostCandidates(plugin: DiscoveredPlugin): string[] {
    const spec = plugin.manifest.hostModule?.trim();
    const folder = plugin.folderPath;
    const fromSpec = spec
        ? [path.resolve(folder, spec)]
        : [
            path.join(folder, "host", "index.js"),
            path.join(folder, "host", "index.ts"),
        ];
    const dist = path.join(folder, "host", "dist", "index.js");
    if (process.env.NODE_ENV === "test") {
        // Source when the checkout has it. The built module is what production
        // loads, so a dist-only plugin (the deployed tree) still runs in tests.
        const ts = fromSpec.filter((candidate) => candidate.endsWith(".ts"));
        return [...new Set([...ts, dist, ...fromSpec.filter((candidate) => candidate.endsWith(".js"))])];
    }
    return [...new Set([dist, ...fromSpec])];
}

export async function loadHostModule(plugin: DiscoveredPlugin): Promise<PluginHostModule | null> {
    const cached = cache.get(plugin.manifest.id);
    if (cached !== undefined) {
        return cached;
    }
    for (const candidate of hostCandidates(plugin)) {
        try {
            const href = pathToFileURL(candidate).href;
            const loaded = await import(
                /* webpackIgnore: true */
                /* turbopackIgnore: true */
                href
            ) as PluginHostModule;
            cache.set(plugin.manifest.id, loaded);
            return loaded;
        } catch (error) {
            pluginLogger().warn({
                event: "plugin.host_module.load_failed",
                plugin_id: plugin.manifest.id,
                candidate,
                err: error instanceof Error ? error.message : "unknown",
            });
            continue;
        }
    }
    return null;
}
