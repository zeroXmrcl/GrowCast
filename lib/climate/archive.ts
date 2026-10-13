import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {isDateOnly} from "@/lib/date-only";
import {readClimateDays, resetClimateCurrent} from "@/lib/climate/store";
import type {ClimateDayFile} from "@/lib/climate/types";

export class ClimateCopyError extends Error {
    constructor() {
        super("climate_copy_failed");
        this.name = "ClimateCopyError";
    }
}

export async function stageClimateArchive(
    stagingRoot: string,
    growId: string,
    endedAt: string,
    seededAt: string,
): Promise<void> {
    const days = await readClimateDays();
    let earliest = "";
    const payloadDays: Record<string, ClimateDayFile> = {};
    for (const [date, file] of days) {
        payloadDays[date] = file;
        const first = file.points[0]?.t ?? "";
        if (first && (!earliest || first < earliest)) {
            earliest = first;
        }
    }
    const startedAt = isDateOnly(seededAt) && seededAt !== "2001-01-01" ? seededAt : earliest || endedAt;
    try {
        await atomicWriteFile(
            path.join(stagingRoot, "climate.json"),
            JSON.stringify({version: 1, growId, startedAt, endedAt, days: payloadDays}),
        );
    } catch {
        if (days.size > 0) {
            throw new ClimateCopyError();
        }
    }
}

export async function resetClimateCurrentLocked(): Promise<void> {
    await resetClimateCurrent();
}
