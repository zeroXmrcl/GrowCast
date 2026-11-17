import {accrueEnergyOnIngest} from "@/plugins/ggs/host/energy/accrue";
import {recordClimateOnIngestBestEffort} from "@/plugins/ggs/host/climate/writer";
import {parseIngestBody, withStale, type GgsLiveIngest} from "@/plugins/ggs/host/ggs-live";
import {saveGgsLive} from "@/plugins/ggs/host/ggs-live-store";
import {publishLive} from "@/plugins/ggs/host/ggs-live-hub";
import {PLUGIN_API_VERSION, type PluginHostModule, type PluginIngestBody} from "@/lib/plugins/types";

export function fromMeshState(raw: unknown): PluginIngestBody | {error: string} {
    const parsed = parseIngestBody(raw);
    if (!parsed.ok) {
        return {error: parsed.error};
    }
    return {
        apiVersion: PLUGIN_API_VERSION,
        observedAt: parsed.value.updatedAt,
        state: parsed.value as unknown as Record<string, unknown>,
    };
}

export async function onIngest(input: Parameters<NonNullable<PluginHostModule["onIngest"]>>[0]): Promise<void> {
    if (!input.state) {
        return;
    }
    const parsed = parseIngestBody(input.state);
    if (!parsed.ok) {
        return;
    }
    const snapshot: GgsLiveIngest = parsed.value;
    await saveGgsLive(snapshot);
    await recordClimateOnIngestBestEffort(snapshot);
    try {
        await accrueEnergyOnIngest(snapshot);
    } catch {
        /* energy is best-effort on the live path */
    }
    try {
        const {nowWattsFromSnapshot} = await import("@/plugins/ggs/host/energy/scoreboard");
        const {readEnergySettings} = await import("@/plugins/ggs/host/energy/settings");
        const settings = await readEnergySettings();
        const watts = nowWattsFromSnapshot(snapshot, settings.overrides);
        input.state.energy = {
            nowWatts: watts === null ? null : Math.round(watts),
        };
    } catch {
        /* tent watts on plugin state are best-effort */
    }
    publishLive(withStale(snapshot));
}
