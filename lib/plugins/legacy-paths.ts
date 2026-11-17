import {existsSync} from "node:fs";
import {pluginDataDir} from "@/lib/plugins/paths";

export function pluginOrLegacyDir(pluginId: string, relative: string, legacy: string): string {
    const next = `${pluginDataDir(pluginId)}/${relative}`.replace(/\/+/g, "/");
    if (existsSync(next)) {
        return next;
    }
    return legacy;
}

export function pluginOrLegacyFile(pluginId: string, relative: string, legacy: string): string {
    const next = `${pluginDataDir(pluginId)}/${relative}`.replace(/\/+/g, "/");
    if (existsSync(next)) {
        return next;
    }
    if (existsSync(legacy)) {
        return legacy;
    }
    return next;
}
