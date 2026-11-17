import type {PluginDefinition} from "@growcast/plugin-sdk/ui";

type Loader = () => Promise<{default: PluginDefinition} | PluginDefinition>;

export const FIRST_PARTY_UI_LOADERS: Record<string, Loader> = {
    "growcast.solar": () => import("@/plugins/solar/ui/src/index"),
    "growcast.ggs": () => import("@/plugins/ggs/ui/src/index"),
    "growcast.timelapse": () => import("@/plugins/timelapse/ui/src/index"),
    "growcast.restream": () => import("@/plugins/restream/ui/src/index"),
};

export async function loadFirstPartyUi(pluginId: string): Promise<PluginDefinition | null> {
    const loader = FIRST_PARTY_UI_LOADERS[pluginId];
    if (!loader) {
        return null;
    }
    try {
        const mod = await loader();
        return "default" in mod ? mod.default : mod;
    } catch {
        return null;
    }
}
