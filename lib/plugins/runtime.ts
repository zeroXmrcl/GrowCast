import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {generatePluginsCompose} from "@/lib/plugins/compose";
import {assertDockerHostIsProxy, assertPluginRuntimeTarget, dockerEngineBaseUrl} from "@/lib/plugins/docker-guard";
import {
    createPluginContainer,
    removePluginContainer,
    startPluginContainer,
    stopPluginContainer,
} from "@/lib/plugins/docker-engine";
import {pluginServiceName} from "@/lib/plugins/ids";
import {containedPluginPath} from "@/lib/plugins/containment";
import {pluginLogger} from "@/lib/plugins/log";
import {pluginRuntimeEnvFile} from "@/lib/plugins/paths";
import {readPluginToken} from "@/lib/plugins/tokens";

const PROCESS_ENV_KEYS = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TERM"] as const;

const DENIED_PROCESS_ENV = new Set([
    "ADMIN_PASSWORD_HASH",
    "ADMIN_SESSION_SECRET",
    "GROWCAST_DOCKER_PROXY_TOKEN",
    "GROWCAST_MESH_TOKEN",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "XAI_API_KEY",
]);

function isProcessEnvKey(key: string): boolean {
    return /^[A-Z_][A-Z0-9_]*$/.test(key) && !DENIED_PROCESS_ENV.has(key);
}

export function pluginProcessEnv(input: {
    inherited: NodeJS.ProcessEnv;
    pluginId: string;
    token: string;
    extra?: Record<string, string>;
    runtimeEnv?: Record<string, string>;
}): NodeJS.ProcessEnv {
    const nodeEnv = input.inherited.NODE_ENV;
    const env: NodeJS.ProcessEnv = {
        NODE_ENV: nodeEnv === "development" || nodeEnv === "test" || nodeEnv === "production" ? nodeEnv : "production",
    };
    for (const key of PROCESS_ENV_KEYS) {
        const value = input.inherited[key];
        if (typeof value === "string") {
            env[key] = value;
        }
    }
    env.GROWCAST_PLUGIN_ID = input.pluginId;
    env.GROWCAST_PLUGIN_TOKEN = input.token;
    env.GROWCAST_URL = "http://growcast:3000";
    env.PYTHONDONTWRITEBYTECODE = "1";
    env.PYTHONUNBUFFERED = "1";
    for (const source of [input.extra, input.runtimeEnv]) {
        if (!source) {
            continue;
        }
        for (const [key, value] of Object.entries(source)) {
            if (!isProcessEnvKey(key) || typeof value !== "string") {
                continue;
            }
            env[key] = value;
        }
    }
    return env;
}

async function readRuntimeEnvMap(pluginId: string): Promise<Record<string, string>> {
    try {
        const file = await readFile(pluginRuntimeEnvFile(pluginId), "utf8");
        const out: Record<string, string> = {};
        for (const line of file.split(/\r?\n/)) {
            if (!line || line.startsWith("#") || !line.includes("=")) {
                continue;
            }
            const eq = line.indexOf("=");
            out[line.slice(0, eq)] = line.slice(eq + 1);
        }
        return out;
    } catch {
        return {};
    }
}

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
        const entry = containedPluginPath(discovered.folderPath, discovered.manifest.runtime.entry);
        if (!entry) {
            pluginLogger().warn({
                event: "plugin.runtime.escape",
                plugin_id: discovered.manifest.id,
                candidate: discovered.manifest.runtime.entry,
            });
            return;
        }
        const token = await readPluginToken(discovered.manifest.id);
        if (!token) {
            pluginLogger().warn({
                event: "plugin.runtime.missing_token",
                plugin_id: discovered.manifest.id,
            });
            return;
        }
        const cmd = discovered.manifest.runtime.type === "node" ? "node" : "python";
        const child = spawn(cmd, ["-u", entry], {
            cwd: discovered.folderPath,
            env: pluginProcessEnv({
                inherited: process.env,
                pluginId: discovered.manifest.id,
                token,
                extra: discovered.manifest.runtime.extraEnv,
                runtimeEnv: await readRuntimeEnvMap(discovered.manifest.id),
            }),
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
