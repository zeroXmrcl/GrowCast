import {readPluginConfigForBackend} from "@/lib/plugins/config";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {loadHostModule} from "@/lib/plugins/first-party";
import {pluginLogger} from "@/lib/plugins/log";
import {allowPluginIngest, ingestIntervalMs} from "@/lib/plugins/rate-limit";
import {
    appendPluginSeries,
    counterDelta,
    readPluginCounters,
    readPluginState,
    writePluginCounters,
    writePluginState,
    type StoredMetric,
} from "@/lib/plugins/store";
import {validateIngestBody} from "@/lib/plugins/validator";
import {publishPluginLive} from "@/lib/plugins/sse";

export type IngestResult =
    | {ok: true}
    | {ok: false; status: 404 | 409 | 422 | 429; error: string};

export async function ingestPluginPayload(
    pluginId: string,
    raw: unknown,
    nowMs = Date.now(),
): Promise<IngestResult> {
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        return {ok: false, status: 404, error: "Unknown plugin"};
    }
    const {getRegistryRecord, pluginIsActive, pausePlugin} = await import("@/lib/plugins/registry");
    const record = await getRegistryRecord(pluginId);
    if (record && !record.hashMatches && record.pinnedHash) {
        await pausePlugin(pluginId, "hash-mismatch");
        return {ok: false, status: 409, error: "Plugin files changed; re-confirm the hash in Admin"};
    }
    if (!pluginIsActive(record) && record?.status !== "enabled") {
        return {ok: false, status: 409, error: "Plugin is not enabled"};
    }
    const config = await readPluginConfigForBackend(pluginId);
    if (!allowPluginIngest(pluginId, ingestIntervalMs(config), nowMs)) {
        return {ok: false, status: 429, error: "Too many ingest requests"};
    }
    const counters = await readPluginCounters(pluginId);
    const previousValues = Object.fromEntries(
        Object.entries(counters.values).map(([key, item]) => [key, item.value]),
    );
    const parsed = validateIngestBody(discovered.manifest, raw, config, previousValues, nowMs);
    if ("error" in parsed) {
        pluginLogger().warn({event: "plugin.ingest.rejected", plugin_id: pluginId, error: parsed.error});
        return {ok: false, status: parsed.status, error: parsed.error};
    }
    const previous = await readPluginState(pluginId);
    const metrics: Record<string, StoredMetric> = {...previous?.metrics};
    const liveNumbers: Record<string, number | null> = {};
    for (const [key, spec] of Object.entries(discovered.manifest.metrics)) {
        if (!(key in parsed.metrics)) {
            liveNumbers[key] = previous?.metrics[key]?.value ?? null;
            continue;
        }
        const value = parsed.metrics[key];
        metrics[key] = {value, observedAt: parsed.observedAt};
        liveNumbers[key] = value;
        if (spec.kind === "counter") {
            const prev = counters.values[key];
            const {reset} = counterDelta(prev?.value, value);
            counters.values[key] = {
                value,
                observedAt: parsed.observedAt,
                origin: reset || !prev ? value : prev.origin,
            };
        }
    }
    const host = await loadHostModule(discovered);
    const ingestInput = {
        pluginId,
        observedAt: parsed.observedAt,
        metrics: liveNumbers,
        state: parsed.state ? {...parsed.state} : {},
    };
    try {
        await host?.onIngest?.(ingestInput);
    } catch (error) {
        pluginLogger().warn({
            event: "plugin.ingest.host_module_failed",
            plugin_id: pluginId,
            err: error instanceof Error ? error.message : "unknown",
        });
    }
    for (const key of Object.keys(discovered.manifest.metrics)) {
        const value = liveNumbers[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            metrics[key] = {value, observedAt: parsed.observedAt};
        }
    }
    const pluginState = ingestInput.state && typeof ingestInput.state === "object" && !Array.isArray(ingestInput.state)
        ? ingestInput.state
        : {};
    await writePluginState({
        pluginId,
        observedAt: parsed.observedAt,
        metrics,
        state: Object.keys(pluginState).length > 0 ? pluginState : parsed.state,
    });
    await writePluginCounters(pluginId, counters);
    await appendPluginSeries(pluginId, parsed.observedAt, liveNumbers);
    await publishPluginLive(pluginId);
    pluginLogger().info({event: "plugin.ingest.accepted", plugin_id: pluginId});
    return {ok: true};
}
