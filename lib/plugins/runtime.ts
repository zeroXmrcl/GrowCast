import {spawn} from "node:child_process";
import path from "node:path";
import {generatePluginsCompose} from "@/lib/plugins/compose";
import {assertDockerHostIsProxy, assertPluginRuntimeTarget, dockerEngineBaseUrl} from "@/lib/plugins/docker-guard";
import {
    createPluginContainer,
    removePluginContainer,
    startPluginContainer,
    stopPluginContainer,
} from "@/lib/plugins/docker-engine";
import {pluginServiceName} from "@/lib/plugins/ids";
import {pluginLogger} from "@/lib/plugins/log";
import {readPluginToken} from "@/lib/plugins/tokens";

export type PluginRuntimeAdapter = {
    start(serviceName: string): Promise<void>;
    stop(serviceName: string): Promise<void>;
};

const children = new Map<string, ReturnType<typeof spawn>>();

async function discoveredForService(serviceName: string) {
    const {discoverPlugins} = await import("@/lib/plugins/discovery");
    const {plugins} = await discoverPlugins();
    return plugins.find((plugin) => pluginServiceName(plugin.manifest.id) === serviceName) ?? null;
}

const dockerAdapter: PluginRuntimeAdapter = {
    async start(serviceName) {
        assertPluginRuntimeTarget(serviceName);
        assertDockerHostIsProxy(process.env.DOCKER_HOST ?? "tcp://docker-plugin-proxy:2375");
        await generatePluginsCompose();
        const discovered = await discoveredForService(serviceName);
        if (!discovered) {
            throw new Error(`Unknown plugin service ${serviceName}`);
        }
        const token = await readPluginToken(discovered.manifest.id);
        if (!token) {
            throw new Error(`No plugin token for ${discovered.manifest.id}`);
        }
        await stopPluginContainer(serviceName);
        await removePluginContainer(serviceName);
        await createPluginContainer(discovered, token);
        await startPluginContainer(serviceName);
    },
    async stop(serviceName) {
        assertPluginRuntimeTarget(serviceName);
        await generatePluginsCompose();
        await stopPluginContainer(serviceName).catch(() => undefined);
    },
};

const processAdapter: PluginRuntimeAdapter = {
    async start(serviceName) {
        assertPluginRuntimeTarget(serviceName);
        const discovered = await discoveredForService(serviceName);
        if (!discovered?.manifest.runtime?.entry) {
            return;
        }
        await generatePluginsCompose();
        const entry = path.join(discovered.folderPath, discovered.manifest.runtime.entry);
        const cmd = discovered.manifest.runtime.type === "node" ? "node" : "python";
        const child = spawn(cmd, ["-u", entry], {
            cwd: discovered.folderPath,
            env: {...process.env},
            stdio: "pipe",
        });
        children.set(serviceName, child);
        child.on("exit", () => children.delete(serviceName));
    },
    async stop(serviceName) {
        const child = children.get(serviceName);
        if (!child?.pid) {
            return;
        }
        child.kill("SIGTERM");
        children.delete(serviceName);
    },
};

const noneAdapter: PluginRuntimeAdapter = {
    async start(serviceName) {
        assertPluginRuntimeTarget(serviceName);
        await generatePluginsCompose();
    },
    async stop(serviceName) {
        assertPluginRuntimeTarget(serviceName);
        await generatePluginsCompose();
    },
};

function adapter(): PluginRuntimeAdapter {
    const mode = (process.env.GROWCAST_PLUGIN_RUNTIME ?? "docker").trim().toLowerCase();
    if (mode === "none") {
        return noneAdapter;
    }
    if (mode === "process") {
        return processAdapter;
    }
    return dockerAdapter;
}

export async function startPluginRuntime(pluginId: string): Promise<void> {
    const service = pluginServiceName(pluginId);
    assertPluginRuntimeTarget(service, pluginId);
    try {
        await adapter().start(service);
        pluginLogger().info({event: "plugin.runtime.started", plugin_id: pluginId, service});
    } catch (error) {
        pluginLogger().warn({
            event: "plugin.runtime.start_failed",
            plugin_id: pluginId,
            err: error instanceof Error ? error.message : "unknown",
            docker_host: dockerEngineBaseUrl(),
        });
        if ((process.env.GROWCAST_PLUGIN_RUNTIME ?? "docker") !== "process") {
            try {
                await processAdapter.start(service);
            } catch (fallbackError) {
                pluginLogger().warn({
                    event: "plugin.runtime.fallback_failed",
                    plugin_id: pluginId,
                    err: fallbackError instanceof Error ? fallbackError.message : "unknown",
                });
            }
        }
    }
}

export async function stopPluginRuntime(pluginId: string): Promise<void> {
    const service = pluginServiceName(pluginId);
    assertPluginRuntimeTarget(service, pluginId);
    try {
        await adapter().stop(service);
        await processAdapter.stop(service);
        pluginLogger().info({event: "plugin.runtime.stopped", plugin_id: pluginId, service});
    } catch (error) {
        pluginLogger().warn({
            event: "plugin.runtime.stop_failed",
            plugin_id: pluginId,
            err: error instanceof Error ? error.message : "unknown",
        });
    }
}

export async function syncPluginRuntimes(): Promise<void> {
    await generatePluginsCompose();
}
