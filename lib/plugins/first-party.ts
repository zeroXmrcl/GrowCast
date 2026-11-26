import {stat} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {containedPluginPath} from "@/lib/plugins/containment";
import {pluginLogger} from "@/lib/plugins/log";
import type {DiscoveredPlugin, PluginHostModule} from "@/lib/plugins/types";

const cache = new Map<string, {stamp: string; loaded: PluginHostModule}>();

export function invalidateHostModule(pluginId: string): void {
    cache.delete(pluginId);
}

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

async function moduleStamp(candidates: string[], stamp?: string): Promise<string> {
    if (stamp) {
        return stamp;
    }
    const parts: string[] = [];
    for (const candidate of candidates) {
        try {
            const info = await stat(candidate);
            const mtimeNs = (info as {mtimeNs?: bigint}).mtimeNs;
            const mtime = typeof mtimeNs === "bigint" ? mtimeNs.toString() : String(Math.trunc(info.mtimeMs));
            parts.push(`${candidate}\0${info.size}:${mtime}`);
        } catch {
            parts.push(`${candidate}\0missing`);
        }
    }
    return parts.join("\n");
}

export async function loadHostModule(plugin: DiscoveredPlugin, stamp?: string): Promise<PluginHostModule | null> {
    const candidates = hostCandidates(plugin);
    const freshness = await moduleStamp(candidates, stamp);
    const cached = cache.get(plugin.manifest.id);
    if (cached && cached.stamp === freshness) {
        return cached.loaded;
    }
    for (const candidate of candidates) {
        try {
            const href = `${pathToFileURL(candidate).href}?growcast=${encodeURIComponent(freshness)}`;
            const loaded = await import(
                /* webpackIgnore: true */
                /* turbopackIgnore: true */
                href
            ) as PluginHostModule;
            cache.set(plugin.manifest.id, {stamp: freshness, loaded});
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
