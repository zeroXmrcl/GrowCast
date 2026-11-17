import path from "node:path";
import {growcastDataDir} from "@/lib/data-paths";

export function pluginsRoot(): string {
    const override = process.env.GROWCAST_PLUGINS_DIR?.trim();
    return override ? path.resolve(override) : path.join(process.cwd(), "plugins");
}

export function pluginDataRoot(): string {
    return path.join(growcastDataDir(), "plugins");
}

export function pluginRegistryFile(): string {
    return path.join(pluginDataRoot(), "registry.json");
}

export function pluginTokensFile(): string {
    return path.join(pluginDataRoot(), "tokens.json");
}

export function pluginDataDir(pluginId: string): string {
    return path.join(pluginDataRoot(), pluginId);
}

export function pluginStateFile(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "state.json");
}

export function pluginHeartbeatFile(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "heartbeat.json");
}

export function pluginConfigFile(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "config.json");
}

export function pluginSecretsFile(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "secrets.json");
}

export function pluginSeriesDir(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "series");
}

export function pluginCountersFile(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "counters.json");
}

export function pluginMediaDir(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "media");
}

export function pluginRuntimeEnvFile(pluginId: string): string {
    return path.join(pluginDataDir(pluginId), "runtime.env");
}

export function generatedComposeFile(): string {
    const override = process.env.GROWCAST_COMPOSE_DIR?.trim();
    const root = override ? path.resolve(override) : process.cwd();
    return path.join(root, "compose.plugins.generated.yml");
}
