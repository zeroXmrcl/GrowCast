import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
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
