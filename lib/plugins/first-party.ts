import {pathToFileURL} from "node:url";
import {containedPluginPath} from "@/lib/plugins/containment";
import {pluginLogger} from "@/lib/plugins/log";
import type {DiscoveredPlugin, PluginHostModule} from "@/lib/plugins/types";

const cache = new Map<string, PluginHostModule | null>();

export function _resetHostModuleCacheForTests(): void {
    cache.clear();
}

function inside(folder: string, spec: string): string | null {
    const resolved = containedPluginPath(folder, spec);
    if (!resolved && spec.trim()) {
        pluginLogger().warn({
            event: "plugin.host_module.escape",
            plugin_id: folder,
            candidate: spec,
        });
    }
    return resolved;
}

function hostCandidates(plugin: DiscoveredPlugin): string[] {
    const spec = plugin.manifest.hostModule?.trim();
    const folder = plugin.folderPath;
    const fromSpec = (spec
        ? [inside(folder, spec)]
        : [
            inside(folder, "host/index.js"),
            inside(folder, "host/index.ts"),
        ]).filter((candidate): candidate is string => candidate !== null);
    const dist = inside(folder, "host/dist/index.js");
    if (process.env.NODE_ENV === "test") {
        // Source when the checkout has it. The built module is what production
        // loads, so a dist-only plugin (the deployed tree) still runs in tests.
        const ts = fromSpec.filter((candidate) => candidate.endsWith(".ts"));
        return [...new Set([...ts, dist, ...fromSpec.filter((candidate) => candidate.endsWith(".js"))].filter((candidate): candidate is string => Boolean(candidate)))];
    }
    return [...new Set([dist, ...fromSpec].filter((candidate): candidate is string => Boolean(candidate)))];
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
