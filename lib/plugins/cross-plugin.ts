import {pluginIdForExport} from "@/lib/plugins/capabilities";
import {readPluginLive, readPluginState} from "@/lib/plugins/store";
import type {PluginLiveState} from "@/lib/plugins/types";

export async function readEnabledPluginLive(pluginId: string): Promise<PluginLiveState> {
    return readPluginLive(pluginId);
}

export async function readTentEnergyKwh(window: "today" | "7d" | "30d" | "grow" = "today"): Promise<number | null> {
    const ggsId = await pluginIdForExport("tentEnergy") ?? await pluginIdForExport("energy");
    if (!ggsId) {
        return null;
    }
    const state = await readPluginState(ggsId);
    const nested = state?.state;
    if (!nested || typeof nested !== "object") {
        return null;
    }
    const energy = (nested as {energy?: {windows?: Record<string, {kWh?: number}>}}).energy;
    const kWh = energy?.windows?.[window]?.kWh;
    return typeof kWh === "number" && Number.isFinite(kWh) ? kWh : null;
}

export async function readPluginPublicState(pluginId: string): Promise<Record<string, unknown> | null> {
    const stored = await readPluginState(pluginId);
    return stored?.state ?? null;
}
