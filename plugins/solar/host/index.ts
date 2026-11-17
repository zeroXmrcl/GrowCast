import {pluginIdForExport} from "@/lib/plugins/capabilities";
import {readPluginConfig} from "@/lib/plugins/config";
import {readPluginLive} from "@/lib/plugins/store";
import type {PluginHostModule} from "@/lib/plugins/types";
import {allocateSolarInstant, type AllocationMode, type BatteryDischargeOrigin} from "./allocation";

function asMode(value: unknown): AllocationMode {
    return value === "tent-first" || value === "tent-last" ? value : "proportional";
}

function asOrigin(value: unknown): BatteryDischargeOrigin {
    return value === "always-grid" || value === "mix" ? value : "always-solar";
}

function tentWattsFromGgs(state: Record<string, unknown> | null): number | null {
    if (!state || typeof state !== "object") {
        return null;
    }
    const energy = (state as {energy?: {nowWatts?: unknown}}).energy;
    const watts = energy?.nowWatts;
    return typeof watts === "number" && Number.isFinite(watts) ? watts : null;
}

export async function onIngest(
    input: Parameters<NonNullable<PluginHostModule["onIngest"]>>[0],
): Promise<void> {
    const config = await readPluginConfig(input.pluginId);
    const tentPlugin = await pluginIdForExport("tentEnergy") ?? await pluginIdForExport("energy");
    const tentLive = tentPlugin ? await readPluginLive(tentPlugin) : null;
    const tentW = tentWattsFromGgs(tentLive?.state ?? null)
        ?? (typeof input.metrics["tent.power"] === "number" ? input.metrics["tent.power"] : null);
    const split = allocateSolarInstant({
        pvW: input.metrics["pv.power"] ?? null,
        batteryW: input.metrics["battery.power"] ?? null,
        gridW: input.metrics["grid.power"] ?? null,
        houseW: input.metrics["house.power"] ?? null,
        tentW,
        batterySolarMix: 1,
    }, asMode(config.allocationMode), asOrigin(config.batteryDischargeOrigin));
    const state = input.state ?? {};
    state.allocation = split;
    state.tentEnergy = tentLive?.state ?? null;
    input.state = state;
}
