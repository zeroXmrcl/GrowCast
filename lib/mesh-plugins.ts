export const TIMELAPSE_PLUGIN_ID = "growcast.timelapse";
export const GGS_PLUGIN_ID = "growcast.ggs";

export function isKnownMeshPlugin(pluginId: string): boolean {
    return pluginId === TIMELAPSE_PLUGIN_ID || pluginId === GGS_PLUGIN_ID;
}
