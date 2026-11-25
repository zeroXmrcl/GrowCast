import {discoverPlugins} from "@/lib/plugins/discovery";
import {loadHostModule} from "@/lib/plugins/first-party";
import {getRegistryRecord, listRegistryRecords, pluginMayExecute} from "@/lib/plugins/registry";
import type {
    PluginArchiveContext,
    PluginClimatePoint,
    PluginHostModule,
    PluginLiveReadings,
    PluginMediaSources,
    PluginOverlayLook,
    PluginSetupResult,
} from "@/lib/plugins/types";

export type ActiveHost = {
    pluginId: string;
    host: PluginHostModule;
};

export async function listActiveHosts(): Promise<ActiveHost[]> {
    const records = await listRegistryRecords();
    const {plugins} = await discoverPlugins();
    const hosts: ActiveHost[] = [];
    for (const plugin of plugins) {
        const record = records.find((item) => item.id === plugin.manifest.id);
        if (!pluginMayExecute(record)) {
            continue;
        }
        const host = await loadHostModule(plugin, record?.currentHash);
        if (host) {
            hosts.push({pluginId: plugin.manifest.id, host});
        }
    }
    return hosts;
}

export async function bootActivePluginHosts(): Promise<void> {
    const hosts = await listActiveHosts();
    for (const item of hosts) {
        if (!item.host.onBoot) {
            continue;
        }
        await item.host.onBoot();
    }
}

export async function runPluginGrowArchived(ctx: PluginArchiveContext): Promise<void> {
    const hosts = await listActiveHosts();
    for (const item of hosts) {
        if (item.host.onGrowArchived) {
            await item.host.onGrowArchived(ctx);
        }
    }
}

export async function runPluginGrowReset(): Promise<void> {
    const hosts = await listActiveHosts();
    for (const item of hosts) {
        if (item.host.onGrowReset) {
            await item.host.onGrowReset();
        }
    }
}

export async function collectPluginMediaSources(): Promise<PluginMediaSources> {
    const hosts = await listActiveHosts();
    const next: PluginMediaSources = {};
    for (const item of hosts) {
        if (!item.host.archiveMediaSources) {
            continue;
        }
        const sources = await item.host.archiveMediaSources();
        if (sources.snapshotsDir && !next.snapshotsDir) {
            next.snapshotsDir = sources.snapshotsDir;
        }
        if (sources.timelapseDir && !next.timelapseDir) {
            next.timelapseDir = sources.timelapseDir;
        }
    }
    return next;
}

export async function loadPluginClimatePointsForWindow(
    startMs: number,
    endMs: number,
): Promise<PluginClimatePoint[]> {
    const hosts = await listActiveHosts();
    for (const item of hosts) {
        if (item.host.climatePointsForWindow) {
            return item.host.climatePointsForWindow(startMs, endMs);
        }
    }
    return [];
}

export async function loadPluginLiveReadings(): Promise<PluginLiveReadings | null> {
    const hosts = await listActiveHosts();
    for (const item of hosts) {
        if (item.host.liveReadings) {
            return item.host.liveReadings();
        }
    }
    return null;
}

export async function loadPluginSnapshotStill(): Promise<{mime: "image/jpeg"; dataUrl: string} | null> {
    const hosts = await listActiveHosts();
    for (const item of hosts) {
        if (item.host.newestSnapshotStill) {
            return item.host.newestSnapshotStill();
        }
    }
    return null;
}

export async function loadPluginOverlayLook(): Promise<PluginOverlayLook | null> {
    const hosts = await listActiveHosts();
    for (const item of hosts) {
        if (item.host.overlayLook) {
            const look = await item.host.overlayLook();
            if (look) {
                return look;
            }
        }
    }
    return null;
}

async function loadInstallerHost(stepId: string): Promise<PluginHostModule | null> {
    const {plugins} = await discoverPlugins();
    const plugin = plugins.find((item) => item.manifest.installer?.stepId === stepId);
    if (!plugin) {
        return null;
    }
    const record = await getRegistryRecord(plugin.manifest.id);
    if (!pluginMayExecute(record)) {
        return null;
    }
    const {loadHostModule} = await import("@/lib/plugins/first-party");
    return loadHostModule(plugin, record?.currentHash);
}

export async function runPluginSetup(stepId: string, formData: FormData): Promise<PluginSetupResult | null> {
    const host = await loadInstallerHost(stepId);
    if (!host?.handleSetup) {
        return null;
    }
    return host.handleSetup(formData);
}

export async function pluginSetupStatus(stepId: string): Promise<{complete: boolean; detail: string | null} | null> {
    const host = await loadInstallerHost(stepId);
    if (!host?.setupStatus) {
        return null;
    }
    return host.setupStatus();
}
