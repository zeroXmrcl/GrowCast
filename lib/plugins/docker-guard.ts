import {pluginServiceName} from "@/lib/plugins/ids";

const PLUGIN_SERVICE = /^plugin-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFUSED_NAMES = new Set([
    "growcast",
    "docker-socket-proxy",
    "plugin-host",
    "host",
]);

export function isPluginContainerName(name: string): boolean {
    return PLUGIN_SERVICE.test(name) && !REFUSED_NAMES.has(name);
}

export function assertPluginRuntimeTarget(serviceName: string, pluginId?: string): void {
    if (!isPluginContainerName(serviceName)) {
        throw new Error(`Refused: "${serviceName}" is not a plugin container`);
    }
    if (pluginId && serviceName !== pluginServiceName(pluginId)) {
        throw new Error(`Refused: "${serviceName}" does not match plugin "${pluginId}"`);
    }
}

export function assertDockerHostIsProxy(host: string): string {
    const value = host.trim() || "tcp://docker-socket-proxy:2375";
    if (value.startsWith("unix:") || value.includes("docker.sock") || value.startsWith("/")) {
        throw new Error("Refused: raw docker.sock is not allowed; use the docker socket proxy");
    }
    return value;
}

export function dockerEngineBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
    const host = assertDockerHostIsProxy(env.DOCKER_HOST ?? "tcp://docker-socket-proxy:2375");
    if (host.startsWith("tcp://")) {
        return `http://${host.slice("tcp://".length)}`;
    }
    if (host.startsWith("http://") || host.startsWith("https://")) {
        return host;
    }
    return "http://docker-socket-proxy:2375";
}
