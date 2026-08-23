import path from "node:path";
import {growcastDataDir} from "@/lib/data-paths";

export function energyDir(): string {
    return path.join(growcastDataDir(), "energy");
}

export function energySettingsFile(): string {
    return path.join(energyDir(), "settings.json");
}

export function energyCurrentDir(): string {
    return path.join(energyDir(), "current");
}

export function energyCursorFile(): string {
    return path.join(energyCurrentDir(), "cursor.json");
}

export function energyDayFile(dateOnly: string): string {
    return path.join(energyCurrentDir(), `${dateOnly}.json`);
}

export function archiveEnergyFile(archiveId: string): string {
    return path.join(growcastDataDir(), "archives", archiveId, "energy.json");
}
