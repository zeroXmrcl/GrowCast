import type {PluginManifest} from "@/lib/plugins/types";

export function pluginAdminShowsStreamSettings(manifest: PluginManifest): boolean {
    return manifest.exports?.broadcast === true;
}

export function pluginAdminShowsAiSummary(manifest: PluginManifest): boolean {
    return manifest.exports?.liveClimate === true && manifest.exports?.energy === true;
}
