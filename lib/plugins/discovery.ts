import {readdir, readFile, stat} from "node:fs/promises";
import path from "node:path";
import {pluginIdMatchesParam} from "@/lib/plugins/ids";
import {parsePluginManifest} from "@/lib/plugins/manifest";
import {pluginsRoot} from "@/lib/plugins/paths";
import type {DiscoveredPlugin, PluginManifest} from "@/lib/plugins/types";

export type DiscoveryIssue = {
    folderName: string;
    error: string;
};

export type DiscoveryResult = {
    plugins: DiscoveredPlugin[];
    issues: DiscoveryIssue[];
};

const discoveryCache = new Map<string, {signature: string; result: DiscoveryResult}>();

export function _resetDiscoveryCacheForTests(): void {
    discoveryCache.clear();
}

async function discoverySignature(root: string): Promise<string> {
    let entries;
    try {
        entries = await readdir(root, {withFileTypes: true});
    } catch {
        return "missing";
    }
    const parts: string[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
            continue;
        }
        const manifestPath = path.join(root, entry.name, "plugin.json");
        try {
            const info = await stat(manifestPath);
            const mtimeNs = (info as {mtimeNs?: bigint}).mtimeNs;
            const mtime = typeof mtimeNs === "bigint" ? mtimeNs.toString() : String(Math.trunc(info.mtimeMs));
            parts.push(`${entry.name}\0${info.size}\0${mtime}`);
        } catch {
            parts.push(`${entry.name}\0missing`);
        }
    }
    parts.sort();
    return parts.join("\n");
}

export async function readPluginJson(folderPath: string): Promise<PluginManifest | {error: string}> {
    try {
        const raw = JSON.parse(await readFile(path.join(folderPath, "plugin.json"), "utf8")) as unknown;
        const parsed = parsePluginManifest(raw);
        return parsed.ok ? parsed.value : {error: parsed.error};
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
            return {error: "plugin.json is missing"};
        }
        return {error: "plugin.json is not valid JSON"};
    }
}

export async function discoverPlugins(root = pluginsRoot()): Promise<DiscoveryResult> {
    const signature = await discoverySignature(root);
    const cached = discoveryCache.get(root);
    if (cached && cached.signature === signature) {
        return cached.result;
    }
    const result = await discoverPluginsUncached(root);
    discoveryCache.set(root, {signature, result});
    return result;
}

async function discoverPluginsUncached(root: string): Promise<DiscoveryResult> {
    let entries;
    try {
        entries = await readdir(root, {withFileTypes: true});
    } catch {
        return {plugins: [], issues: []};
    }
    const plugins: DiscoveredPlugin[] = [];
    const issues: DiscoveryIssue[] = [];
    const seen = new Map<string, string>();
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
            continue;
        }
        const folderPath = path.join(root, entry.name);
        const manifest = await readPluginJson(folderPath);
        if ("error" in manifest) {
            issues.push({folderName: entry.name, error: manifest.error});
            continue;
        }
        const previous = seen.get(manifest.id);
        if (previous) {
            issues.push({
                folderName: entry.name,
                error: `duplicate plugin id "${manifest.id}" (also in ${previous})`,
            });
            continue;
        }
        seen.set(manifest.id, entry.name);
        plugins.push({folderName: entry.name, folderPath, manifest});
    }
    return {plugins, issues};
}

export async function findDiscoveredPlugin(pluginId: string): Promise<DiscoveredPlugin | null> {
    const {plugins} = await discoverPlugins();
    return plugins.find((item) => item.manifest.id === pluginId) ?? null;
}

export async function resolveDiscoveredPluginId(param: string): Promise<string | null> {
    const {plugins} = await discoverPlugins();
    return plugins.find((item) => pluginIdMatchesParam(item.manifest.id, param))?.manifest.id ?? null;
}
