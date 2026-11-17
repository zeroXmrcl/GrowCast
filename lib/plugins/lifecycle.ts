import {discoverPlugins} from "@/lib/plugins/discovery";
import {pluginLogger} from "@/lib/plugins/log";
import {
    getRegistryRecord,
    listRegistryRecords,
    pausePlugin,
    pluginIsActive,
} from "@/lib/plugins/registry";
import {startPluginRuntime, stopPluginRuntime, syncPluginRuntimes} from "@/lib/plugins/runtime";
import {writeRuntimeEnv} from "@/lib/plugins/compose";

export async function scanAndPauseChangedPlugins(): Promise<string[]> {
    const paused: string[] = [];
    const records = await listRegistryRecords();
    for (const record of records) {
        if (!record.pinnedHash || record.hashMatches) {
            continue;
        }
        if (record.status === "disabled" || record.status === "invalid" || record.status === "discovered") {
            continue;
        }
        await pausePlugin(record.id, "hash-mismatch");
        await stopPluginRuntime(record.id);
        paused.push(record.id);
        pluginLogger().warn({
            event: "plugin.hash_mismatch",
            plugin_id: record.id,
            pinned: record.pinnedHash,
            current: record.currentHash,
        });
    }
    return paused;
}

export async function reconcilePluginRuntimes(): Promise<void> {
    await scanAndPauseChangedPlugins();
    const records = await listRegistryRecords();
    for (const record of records) {
        if (pluginIsActive(record) || (record.status === "enabled" && record.hashMatches)) {
            await writeRuntimeEnv(record.id);
            await startPluginRuntime(record.id);
        } else if (record.status === "paused" || record.status === "disabled") {
            await stopPluginRuntime(record.id);
        }
    }
    await syncPluginRuntimes();
}

export async function bootPluginHost(): Promise<void> {
    const {issues} = await discoverPlugins();
    for (const issue of issues) {
        pluginLogger().warn({event: "plugin.invalid", folder: issue.folderName, error: issue.error});
    }
    try {
        await reconcilePluginRuntimes();
    } catch (error) {
        pluginLogger().warn({
            event: "plugin.boot.failed",
            err: error instanceof Error ? error.message : "unknown",
        });
    }
}

export async function pluginEnabledAndPinned(pluginId: string): Promise<boolean> {
    const record = await getRegistryRecord(pluginId);
    return pluginIsActive(record) || (record?.status === "enabled" && record.hashMatches);
}
