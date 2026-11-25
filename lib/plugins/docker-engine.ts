import {readFile} from "node:fs/promises";
import {lexicalPluginRelative} from "@/lib/plugins/containment";
import {assertDockerHostIsProxy, dockerEngineBaseUrl} from "@/lib/plugins/docker-guard";
import {pluginRuntimeEnvFile} from "@/lib/plugins/paths";
import {pluginServiceName} from "@/lib/plugins/ids";
import type {DiscoveredPlugin} from "@/lib/plugins/types";

export const PLUGIN_LABEL = "growcast.plugin";

export function pluginRuntimeImage(plugin: DiscoveredPlugin): string {
    const image = plugin.manifest.runtime?.image?.trim();
    if (image) {
        return image;
    }
    return `growcast-plugin-${plugin.folderName}:local`;
}

export function hostProjectRoot(env: NodeJS.ProcessEnv = process.env): string {
    return (env.GROWCAST_HOST_PROJECT ?? "").trim().replace(/\/+$/, "");
}

export function parseShmSize(value: string | undefined): number | undefined {
    if (!value) {
        return undefined;
    }
    const match = /^(\d+(?:\.\d+)?)(b|k|kb|m|mb|g|gb)?$/i.exec(value.trim());
    if (!match) {
        return undefined;
    }
    const amount = Number(match[1]);
    const unit = (match[2] ?? "b").toLowerCase();
    const factor = unit.startsWith("g") ? 1024 ** 3 : unit.startsWith("m") ? 1024 ** 2 : unit.startsWith("k") ? 1024 : 1;
    return Math.round(amount * factor);
}

async function envLines(pluginId: string, extra: Record<string, string>): Promise<string[]> {
    const lines = Object.entries(extra).map(([key, value]) => `${key}=${value}`);
    try {
        const file = await readFile(pluginRuntimeEnvFile(pluginId), "utf8");
        for (const line of file.split(/\r?\n/)) {
            if (!line || line.startsWith("#") || !line.includes("=")) {
                continue;
            }
            lines.push(line);
        }
    } catch {
        /* runtime.env is written just before create */
    }
    return lines;
}

export async function pluginCreateConfig(plugin: DiscoveredPlugin, token: string): Promise<Record<string, unknown>> {
    const root = hostProjectRoot();
    if (!root) {
        throw new Error("GROWCAST_HOST_PROJECT is required to create plugin containers");
    }
    const pluginId = plugin.manifest.id;
    const folder = plugin.folderName;
    const runtime = plugin.manifest.runtime;
    const extraEnv = {
        GROWCAST_URL: "http://growcast:3000",
        GROWCAST_PLUGIN_ID: pluginId,
        GROWCAST_PLUGIN_TOKEN: token,
        PYTHONDONTWRITEBYTECODE: "1",
        ...(runtime?.extraEnv ?? {}),
    };
    const shmSize = parseShmSize(runtime?.shmSize);
    const network = (process.env.GROWCAST_PLUGIN_NETWORK ?? "").trim();
    const body: Record<string, unknown> = {
        Image: pluginRuntimeImage(plugin),
        Labels: {[PLUGIN_LABEL]: pluginId},
        User: "1001:1001",
        Env: await envLines(pluginId, extraEnv),
        HostConfig: {
            Privileged: false,
            CapAdd: [],
            Devices: [],
            PidMode: "",
            NetworkMode: network || "bridge",
            RestartPolicy: {Name: "unless-stopped"},
            Binds: [
                `${root}/plugins/${folder}:/plugin:ro`,
                `${root}/data/plugins/${pluginId}:/data`,
            ],
            ...(shmSize ? {ShmSize: shmSize} : {}),
        },
    };
    if (runtime?.command && runtime.command.length > 0) {
        body.Cmd = runtime.command;
    } else if (runtime?.type === "python" || runtime?.type === "node") {
        const entry = lexicalPluginRelative(runtime.entry ?? (runtime.type === "python" ? "backend/main.py" : "backend/main.js"));
        if (!entry) {
            throw new Error(`Plugin runtime entry escapes the plugin directory: ${pluginId}`);
        }
        body.WorkingDir = "/plugin";
        body.Cmd = runtime.type === "python" ? ["python", "-u", entry] : ["node", entry];
    }
    return body;
}

function proxyAuthHeader(): Record<string, string> {
    const token = (process.env.GROWCAST_DOCKER_PROXY_TOKEN ?? "").trim();
    if (!token) {
        throw new Error("GROWCAST_DOCKER_PROXY_TOKEN is not set");
    }
    return {Authorization: `Bearer ${token}`};
}

async function engine(path: string, init: RequestInit = {}): Promise<Response> {
    assertDockerHostIsProxy(process.env.DOCKER_HOST ?? "tcp://docker-plugin-proxy:2375");
    const base = dockerEngineBaseUrl();
    return fetch(`${base}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...proxyAuthHeader(),
            ...(init.headers ?? {}),
        },
    });
}

export async function inspectPluginContainer(serviceName: string): Promise<Response> {
    return engine(`/containers/${encodeURIComponent(serviceName)}/json`);
}

export async function createPluginContainer(plugin: DiscoveredPlugin, token: string): Promise<void> {
    const name = pluginServiceName(plugin.manifest.id);
    const body = await pluginCreateConfig(plugin, token);
    const response = await engine(`/containers/create?name=${encodeURIComponent(name)}`, {
        method: "POST",
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text.trim() || `docker create ${response.status}`);
    }
}

export async function startPluginContainer(serviceName: string): Promise<void> {
    const response = await engine(`/containers/${encodeURIComponent(serviceName)}/start`, {method: "POST"});
    if (response.status === 304 || response.ok) {
        return;
    }
    const text = await response.text();
    throw new Error(text.trim() || `docker start ${response.status}`);
}

export async function stopPluginContainer(serviceName: string): Promise<void> {
    const response = await engine(`/containers/${encodeURIComponent(serviceName)}/stop`, {method: "POST"});
    if (response.status === 304 || response.status === 404 || response.ok) {
        return;
    }
    const text = await response.text();
    throw new Error(text.trim() || `docker stop ${response.status}`);
}

export async function removePluginContainer(serviceName: string): Promise<void> {
    const response = await engine(`/containers/${encodeURIComponent(serviceName)}?force=1`, {method: "DELETE"});
    if (response.status === 404 || response.ok) {
        return;
    }
    const text = await response.text();
    throw new Error(text.trim() || `docker rm ${response.status}`);
}
