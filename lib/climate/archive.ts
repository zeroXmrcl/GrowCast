import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {isDateOnly} from "@/lib/date-only";
import {CLIMATE_ARCHIVE_VERSION, type ClimateArchiveFile, type ClimateDayFile} from "@/lib/climate/types";
import {
    inspectClimateDay,
    listCurrentClimateDates,
    parseClimateDayFile,
    resetClimateCurrent,
    withClimateWriteLock,
} from "@/lib/climate/store";

export class ClimateCopyError extends Error {
    constructor() {
        super("climate_copy_failed");
        this.name = "ClimateCopyError";
    }
}

export function parseClimateArchive(raw: unknown): ClimateArchiveFile | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const growId = typeof record.growId === "string" ? record.growId : "";
    const startedAt = typeof record.startedAt === "string" ? record.startedAt : "";
    const endedAt = typeof record.endedAt === "string" ? record.endedAt : "";
    const daysIn =
        record.days && typeof record.days === "object" && !Array.isArray(record.days)
            ? (record.days as Record<string, unknown>)
            : {};
    const days: Record<string, ClimateDayFile> = {};
    for (const [date, value] of Object.entries(daysIn)) {
        const parsed = parseClimateDayFile(value, date);
        if (parsed) {
            days[parsed.date] = parsed;
        }
    }
    return {
        version: CLIMATE_ARCHIVE_VERSION,
        growId,
        startedAt,
        endedAt,
        days,
    };
}

function resolveStartedAt(
    seededAt: string,
    days: Record<string, ClimateDayFile>,
    endedAt: string,
): string {
    if (isDateOnly(seededAt) && seededAt !== "2001-01-01") {
        return `${seededAt}T00:00:00.000Z`;
    }
    let earliest: string | null = null;
    for (const day of Object.values(days)) {
        const first = day.points[0]?.t;
        if (first && (!earliest || first < earliest)) {
            earliest = first;
        }
    }
    return earliest ?? endedAt;
}

export async function buildClimateArchivePayload(
    growId: string,
    endedAt: string,
    seededAt: string,
): Promise<ClimateArchiveFile> {
    const dates = await listCurrentClimateDates();
    const days: Record<string, ClimateDayFile> = {};
    for (const date of dates) {
        const inspected = await inspectClimateDay(date);
        if (inspected.status === "corrupt") {
            throw new ClimateCopyError();
        }
        if (inspected.status === "ok") {
            days[date] = inspected.day;
        }
    }
    return {
        version: CLIMATE_ARCHIVE_VERSION,
        growId,
        startedAt: resolveStartedAt(seededAt, days, endedAt),
        endedAt,
        days,
    };
}

export async function stageClimateArchive(
    stagingRoot: string,
    growId: string,
    endedAt: string,
    seededAt: string,
): Promise<void> {
    const dates = await listCurrentClimateDates();
    try {
        const payload = await buildClimateArchivePayload(growId, endedAt, seededAt);
        await atomicWriteFile(
            path.join(stagingRoot, "climate.json"),
            JSON.stringify(payload, null, 2),
        );
    } catch (error) {
        if (error instanceof ClimateCopyError) {
            throw error;
        }
        if (dates.length > 0) {
            throw new ClimateCopyError();
        }
        try {
            await atomicWriteFile(
                path.join(stagingRoot, "climate.json"),
                JSON.stringify(
                    {
                        version: CLIMATE_ARCHIVE_VERSION,
                        growId,
                        startedAt: endedAt,
                        endedAt,
                        days: {},
                    } satisfies ClimateArchiveFile,
                    null,
                    2,
                ),
            );
        } catch {
            // Missing climate.json still completes; a grow with no climate history is fine.
        }
    }
}

export async function resetClimateCurrentLocked(): Promise<void> {
    await withClimateWriteLock(() => resetClimateCurrent());
}
