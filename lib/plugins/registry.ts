import {readFile} from "node:fs/promises";
import {isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {discoverPlugins, findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {hashPluginFolder, hashesEqual} from "@/lib/plugins/hash";
import {pluginLogger} from "@/lib/plugins/log";
import {pluginDataDir, pluginRegistryFile} from "@/lib/plugins/paths";
import {pluginHasToken, mintPluginToken, revokePluginToken} from "@/lib/plugins/tokens";
import type {
    PluginPauseReason,
    PluginPermissions,
    PluginRegistryFile,
    PluginRegistryRecord,
    PluginStatus,
} from "@/lib/plugins/types";
import {mkdir} from "node:fs/promises";

const EMPTY_FILE: PluginRegistryFile = {version: 1, plugins: {}};

async function readRegistryFile(): Promise<PluginRegistryFile> {
    try {
        const raw = JSON.parse(await readFile(pluginRegistryFile(), "utf8")) as unknown;
        if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.plugins)) {
            return EMPTY_FILE;
        }
        return raw as PluginRegistryFile;
    } catch {
        return EMPTY_FILE;
    }
}

async function writeRegistryFile(file: PluginRegistryFile): Promise<void> {
    await atomicWriteFile(pluginRegistryFile(), `${JSON.stringify(file, null, 2)}\n`, 0o600);
}

export async function listRegistryRecords(): Promise<PluginRegistryRecord[]> {
    const file = await readRegistryFile();
    const {plugins: discovered, issues} = await discoverPlugins();
    const records: PluginRegistryRecord[] = [];
    const seen = new Set<string>();
    for (const item of discovered) {
        seen.add(item.manifest.id);
        const currentHash = await hashPluginFolder(item.folderPath);
        const stored = file.plugins[item.manifest.id];
        const hashMatches = hashesEqual(stored?.pinnedHash, currentHash);
        let status: PluginStatus = stored?.status ?? "discovered";
        if (stored?.status === "enabled" && stored.pinnedHash && !hashMatches) {
            status = "paused";
        }
        records.push({
            id: item.manifest.id,
            folderName: item.folderName,
            status,
            pinnedHash: stored?.pinnedHash ?? null,
            currentHash,
            hashMatches,
            enabledAt: stored?.enabledAt ?? null,
            installedAt: stored?.installedAt ?? null,
            pausedReason: status === "paused"
                ? (stored?.pausedReason ?? "hash-mismatch")
                : stored?.pausedReason ?? null,
            pausedAt: stored?.pausedAt ?? null,
            versionAtInstall: stored?.versionAtInstall ?? null,
            permissionsAtInstall: stored?.permissionsAtInstall ?? null,
            tokenPresent: await pluginHasToken(item.manifest.id),
        });
    }
    for (const issue of issues) {
        records.push({
            id: `invalid.${issue.folderName}`,
            folderName: issue.folderName,
            status: "invalid",
            pinnedHash: null,
            currentHash: "",
            hashMatches: false,
            enabledAt: null,
            installedAt: null,
            pausedReason: "invalid-manifest",
            pausedAt: null,
            versionAtInstall: null,
            permissionsAtInstall: null,
            tokenPresent: false,
        });
    }
    for (const [id, stored] of Object.entries(file.plugins)) {
        if (seen.has(id)) {
            continue;
        }
        records.push({
            ...stored,
            currentHash: stored.pinnedHash ?? "",
            hashMatches: false,
            tokenPresent: await pluginHasToken(id),
            status: stored.status === "enabled" ? "paused" : stored.status,
            pausedReason: stored.pausedReason ?? "invalid-manifest",
        });
    }
    return records.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getRegistryRecord(pluginId: string): Promise<PluginRegistryRecord | null> {
    const records = await listRegistryRecords();
    return records.find((item) => item.id === pluginId) ?? null;
}

export async function installPlugin(pluginId: string, now = new Date()): Promise<PluginRegistryRecord> {
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        throw new Error(`Plugin "${pluginId}" was not found under plugins/`);
    }
    const hash = await hashPluginFolder(discovered.folderPath);
    const file = await readRegistryFile();
    const previous = file.plugins[pluginId];
    file.plugins[pluginId] = {
        id: pluginId,
        folderName: discovered.folderName,
        status: previous?.status === "enabled" ? "enabled" : "installed",
        pinnedHash: hash,
        enabledAt: previous?.enabledAt ?? null,
        installedAt: previous?.installedAt ?? now.toISOString(),
        pausedReason: null,
        pausedAt: null,
        versionAtInstall: discovered.manifest.version,
        permissionsAtInstall: discovered.manifest.permissions,
    };
    await mkdir(pluginDataDir(pluginId), {recursive: true});
    await writeRegistryFile(file);
    pluginLogger().info({event: "plugin.installed", plugin_id: pluginId, hash});
    const record = await getRegistryRecord(pluginId);
    if (!record) {
        throw new Error(`Plugin "${pluginId}" could not be read after install`);
    }
    return record;
}

export async function enablePlugin(pluginId: string, now = new Date()): Promise<PluginRegistryRecord> {
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        throw new Error(`Plugin "${pluginId}" was not found under plugins/`);
    }
    const hash = await hashPluginFolder(discovered.folderPath);
    const file = await readRegistryFile();
    const previous = file.plugins[pluginId];
    if (!previous?.pinnedHash && previous?.status !== "installed" && previous?.status !== "paused") {
        // First enable also installs and pins.
    }
    await mintPluginToken(pluginId);
    file.plugins[pluginId] = {
        id: pluginId,
        folderName: discovered.folderName,
        status: "enabled",
        pinnedHash: hash,
        enabledAt: now.toISOString(),
        installedAt: previous?.installedAt ?? now.toISOString(),
        pausedReason: null,
        pausedAt: null,
        versionAtInstall: discovered.manifest.version,
        permissionsAtInstall: discovered.manifest.permissions,
    };
    await mkdir(pluginDataDir(pluginId), {recursive: true});
    await writeRegistryFile(file);
    pluginLogger().info({event: "plugin.enabled", plugin_id: pluginId, hash});
    const record = await getRegistryRecord(pluginId);
    if (!record) {
        throw new Error(`Plugin "${pluginId}" could not be read after enable`);
    }
    return record;
}

export async function pausePlugin(
    pluginId: string,
    reason: PluginPauseReason,
    now = new Date(),
): Promise<void> {
    const file = await readRegistryFile();
    const previous = file.plugins[pluginId];
    if (!previous) {
        return;
    }
    file.plugins[pluginId] = {
        ...previous,
        status: "paused",
        pausedReason: reason,
        pausedAt: now.toISOString(),
    };
    await writeRegistryFile(file);
    pluginLogger().warn({event: "plugin.paused", plugin_id: pluginId, reason});
}

export async function disablePlugin(pluginId: string): Promise<void> {
    const file = await readRegistryFile();
    const previous = file.plugins[pluginId];
    if (!previous) {
        return;
    }
    file.plugins[pluginId] = {
        ...previous,
        status: "disabled",
        enabledAt: null,
        pausedReason: "admin",
        pausedAt: new Date().toISOString(),
    };
    await revokePluginToken(pluginId);
    await writeRegistryFile(file);
    pluginLogger().info({event: "plugin.disabled", plugin_id: pluginId});
}

export async function confirmPluginHash(pluginId: string): Promise<PluginRegistryRecord> {
    return enablePlugin(pluginId);
}

export function pluginIsActive(record: PluginRegistryRecord | null): boolean {
    if (!record || !record.hashMatches || !record.pinnedHash) {
        return false;
    }
    return record.status === "enabled" || record.status === "healthy";
}

export function describePermissions(permissions: PluginPermissions): string[] {
    const lines = [`Network: ${permissions.network}`];
    if (permissions.publicPages) {
        lines.push("Public pages: this plugin's UI will run for every visitor");
    }
    if (permissions.media) {
        lines.push("Media: this plugin can store images or video");
    }
    return lines;
}
