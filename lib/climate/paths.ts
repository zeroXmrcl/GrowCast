import path from "node:path";
import {growcastDataDir} from "@/lib/data-paths";

export function climateCurrentDir(): string {
    return path.join(growcastDataDir(), "climate", "current");
}

export function climateDayFile(dateOnly: string): string {
    return path.join(climateCurrentDir(), `${dateOnly}.json`);
}

export function archiveClimateFile(archiveId: string): string {
    return path.join(growcastDataDir(), "archives", archiveId, "climate.json");
}
