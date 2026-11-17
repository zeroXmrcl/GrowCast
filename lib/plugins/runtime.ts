import {spawn} from "node:child_process";
import path from "node:path";
import {generatePluginsCompose} from "@/lib/plugins/compose";
import {assertDockerHostIsProxy, assertPluginRuntimeTarget, dockerEngineBaseUrl} from "@/lib/plugins/docker-guard";
import {pluginServiceName} from "@/lib/plugins/ids";
import {pluginLogger} from "@/lib/plugins/log";
import {generatedComposeFile} from "@/lib/plugins/paths";

export type PluginRuntimeAdapter = {
    start(serviceName: string): Promise<void>;
    stop(serviceName: string): Promise<void>;
};

const children = new Map<string, ReturnType<typeof spawn>>();

function composeDir(): string {
    const override = process.env.GROWCAST_COMPOSE_DIR?.trim();
    return override ? path.resolve(override) : process.cwd();
}

function dockerEnv(): NodeJS.ProcessEnv {
    return {
        ...process.env,
        DOCKER_HOST: assertDockerHostIsProxy(process.env.DOCKER_HOST ?? "tcp://docker-socket-proxy:2375"),
    };
}

function run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: composeDir(),
            stdio: "pipe",
            env: dockerEnv(),
        });
        let stderr = "";
        child.stderr?.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr.trim() || `${command} exited ${code}`));
        });
    });
}

const dockerAdapter: PluginRuntimeAdapter = {
    async start(serviceName) {
        assertPluginRuntimeTarget(serviceName);
        await generatePluginsCompose();
        await run("docker", [
            "compose",
            "-f",
            "docker-compose.yml",
            "-f",
            path.basename(generatedComposeFile()),
            "up",
            "-d",
            "--no-deps",
            "--no-build",
            serviceName,
        ]);
    },
    async stop(serviceName) {
        assertPluginRuntimeTarget(serviceName);
        await generatePluginsCompose();
        await run("docker", [
            "compose",
            "-f",
            "docker-compose.yml",
            "-f",
            path.basename(generatedComposeFile()),
            "stop",
            serviceName,
        ]).catch(() => undefined);
    },
};

async function discoveredForService(serviceName: string) {
    const {discoverPlugins} = await import("@/lib/plugins/discovery");
    const {plugins} = await discoverPlugins();
    return plugins.find((plugin) => pluginServiceName(plugin.manifest.id) === serviceName) ?? null;
}

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
