import {discoverPlugins} from "@/lib/plugins/discovery";
import type {PluginNotice} from "@/lib/plugins/types";

export async function pluginNoticeMap(): Promise<Record<string, PluginNotice>> {
    const {plugins} = await discoverPlugins();
    const map: Record<string, PluginNotice> = {};
    for (const plugin of plugins) {
        Object.assign(map, plugin.manifest.notices ?? {});
    }
    return map;
}
