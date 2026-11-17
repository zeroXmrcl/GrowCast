import path from "node:path";
import {growcastDataDir} from "@/lib/data-paths";
import {pluginOrLegacyDir} from "@/lib/plugins/legacy-paths";

export function climateDir(): string {
    return pluginOrLegacyDir("growcast.ggs", "climate", path.join(growcastDataDir(), "climate"));
}

export function climateCurrentDir(): string {
    return path.join(climateDir(), "current");
}

export function climateDayFile(dateOnly: string): string {
    return path.join(climateCurrentDir(), `${dateOnly}.json`);
}

export function archiveClimateFile(archiveId: string): string {
    return path.join(growcastDataDir(), "archives", archiveId, "climate.json");
}
