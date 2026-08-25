import path from "node:path";
import {readFile} from "node:fs/promises";
import {asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {logEnergy} from "@/lib/energy/log";
import {accrueEnergyPending, withEnergyAccrueLock} from "@/lib/energy/accrue";
import {archiveEnergyFile} from "@/lib/energy/paths";
import {
    energyCursorExists,
    inspectEnergyDay,
    listCurrentEnergyDates,
    parseCursorDevices,
    parseEnergyDayFile,
    readEnergyCursor,
    resetEnergyCurrent,
} from "@/lib/energy/store";
import type {EnergyArchiveFile, EnergyDayHours} from "@/lib/energy/types";

export class EnergyCopyError extends Error {
    constructor() {
        super("energy_copy_failed");
        this.name = "EnergyCopyError";
    }
}

export function parseEnergyArchive(raw: unknown): EnergyArchiveFile | null {
    if (!isRecord(raw)) {
        return null;
    }
    const growId = asString(raw.growId, "");
    const startedAt = asString(raw.startedAt, "");
    const endedAt = asString(raw.endedAt, "");
    const daysIn = isRecord(raw.days) ? raw.days : {};
    const days: Record<string, {hours: EnergyDayHours}> = {};
    for (const [date, value] of Object.entries(daysIn)) {
        const parsed = parseEnergyDayFile(
            isRecord(value) ? {date, hours: value.hours} : value,
            date,
        );
        if (parsed) {
            days[parsed.date] = {hours: parsed.hours};
        }
    }
    return {
        version: 1,
        growId,
        startedAt,
        endedAt,
        days,
        devices: parseCursorDevices(raw.devices),
    };
}

export async function readArchiveEnergy(archiveId: string): Promise<EnergyArchiveFile | null> {
    try {
        const raw = JSON.parse(await readFile(archiveEnergyFile(archiveId), "utf8")) as unknown;
        const parsed = parseEnergyArchive(raw);
        if (!parsed) {
            logEnergy("corrupt_energy_archive");
            return {
                version: 1,
                growId: "",
                startedAt: "",
                endedAt: "",
                days: {},
                devices: [],
            };
        }
        return parsed;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        logEnergy("corrupt_energy_archive");
        return {
            version: 1,
            growId: "",
            startedAt: "",
            endedAt: "",
            days: {},
            devices: [],
        };
    }
}

export async function buildEnergyArchivePayload(
    growId: string,
    endedAt: string,
): Promise<EnergyArchiveFile> {
    const dates = await listCurrentEnergyDates();
    const cursor = await readEnergyCursor();
    if (!cursor || cursor.growId !== growId) {
        if (dates.length > 0) {
            throw new EnergyCopyError();
        }
        return {
            version: 1,
            growId,
            startedAt: endedAt,
            endedAt,
            days: {},
            devices: [],
        };
    }
    const days: Record<string, {hours: EnergyDayHours}> = {};
    for (const date of dates) {
        const inspected = await inspectEnergyDay(date);
        if (inspected.status === "corrupt") {
            throw new EnergyCopyError();
        }
        if (inspected.status === "ok") {
            days[date] = {hours: inspected.day.hours};
        }
    }
    return {
        version: 1,
        growId: cursor.growId,
        startedAt: cursor.startedAt,
        endedAt,
        days,
        devices: cursor.devices,
    };
}

export async function stageEnergyArchive(
    stagingRoot: string,
    growId: string,
    endedAt: string,
): Promise<void> {
    const hadCursor = await energyCursorExists();
    try {
        try {
            await accrueEnergyPending();
        } catch {
            logEnergy("energy_accrue_failed");
        }
        const payload = await buildEnergyArchivePayload(growId, endedAt);
        await atomicWriteFile(
            path.join(stagingRoot, "energy.json"),
            JSON.stringify(payload, null, 2),
        );
    } catch (error) {
        if (error instanceof EnergyCopyError) {
            throw error;
        }
        const dates = await listCurrentEnergyDates();
        if (hadCursor || dates.length > 0) {
            throw new EnergyCopyError();
        }
        try {
            await atomicWriteFile(
                path.join(stagingRoot, "energy.json"),
                JSON.stringify(
                    {
                        version: 1,
                        growId,
                        startedAt: endedAt,
                        endedAt,
                        days: {},
                    } satisfies EnergyArchiveFile,
                    null,
                    2,
                ),
            );
        } catch {
            // Missing energy.json still completes; archives with no log show zeros.
        }
    }
}

export async function resetEnergyCurrentLocked(): Promise<void> {
    await withEnergyAccrueLock(() => resetEnergyCurrent());
}
