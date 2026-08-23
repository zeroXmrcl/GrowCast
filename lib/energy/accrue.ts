import {GGS_FUTURE_SKEW_MS, type GgsDeviceSnapshot, type GgsLiveIngest} from "@/lib/ggs-live";
import {getCurrentGrow} from "@/lib/db";
import {readGgsLive} from "@/lib/ggs-live-store";
import {actuatorKey} from "@/lib/energy/catalog";
import {splitBerlinHours} from "@/lib/energy/berlin";
import {logEnergy} from "@/lib/energy/log";
import {
    inspectEnergyDay,
    mergeDaySeconds,
    readEnergyCursor,
    resetEnergyCurrent,
    restoreEnergyDayWrites,
    writeEnergyCursor,
    writeEnergyDay,
    type EnergyDayWriteSnapshot,
} from "@/lib/energy/store";
import type {EnergyCursor, EnergyDayFile} from "@/lib/energy/types";

export {actuatorKey};

export const ENERGY_ACCRUE_GAP_MS = 15 * 60 * 1000;

export type AccrueAddition = {
    date: string;
    hour: number;
    key: string;
    level: string;
    seconds: number;
};

export type AccruePlan =
    | {kind: "noop"}
    | {kind: "skip"}
    | {kind: "init"; cursor: EnergyCursor}
    | {kind: "advance"; cursor: EnergyCursor; paused: boolean; additions: AccrueAddition[]};

let accrueChain: Promise<unknown> = Promise.resolve();

export function _resetEnergyAccrueLockForTests(): void {
    accrueChain = Promise.resolve();
}

export function withEnergyAccrueLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = accrueChain.then(fn, fn);
    accrueChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

export function eventTimeMs(updatedAt: string, serverNowMs: number): number {
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts) || ts - serverNowMs > GGS_FUTURE_SKEW_MS) {
        return serverNowMs;
    }
    return ts;
}

export function pendingAccrueEventTimeMs(updatedAt: string, serverNowMs: number): number {
    const snapshotMs = eventTimeMs(updatedAt, serverNowMs);
    return Math.min(serverNowMs, snapshotMs + ENERGY_ACCRUE_GAP_MS);
}

function iso(ms: number): string {
    return new Date(ms).toISOString();
}

function additionsFromPrevious(
    devices: GgsDeviceSnapshot[],
    t1Ms: number,
    t2Ms: number,
): AccrueAddition[] {
    const slices = splitBerlinHours(t1Ms, t2Ms);
    const additions: AccrueAddition[] = [];
    for (const device of devices) {
        for (const actuator of device.actuators) {
            if (!actuator.on || actuator.level === null) {
                continue;
            }
            const key = actuatorKey(device.serial, actuator.id);
            const level = String(actuator.level);
            for (const slice of slices) {
                additions.push({
                    date: slice.date,
                    hour: slice.hour,
                    key,
                    level,
                    seconds: slice.seconds,
                });
            }
        }
    }
    return additions;
}

export function planAccrue(options: {
    cursor: EnergyCursor | null;
    currentGrowId: string;
    eventTimeMs: number;
    newDevices: GgsDeviceSnapshot[];
}): AccruePlan {
    const growId = options.currentGrowId.trim();
    if (!growId) {
        return {kind: "skip"};
    }
    if (!options.cursor) {
        return {
            kind: "init",
            cursor: {
                growId,
                startedAt: iso(options.eventTimeMs),
                lastAccruedAt: iso(options.eventTimeMs),
                devices: options.newDevices,
            },
        };
    }
    if (options.cursor.growId !== growId) {
        return {kind: "skip"};
    }
    const lastMs = Date.parse(options.cursor.lastAccruedAt);
    if (!Number.isFinite(lastMs)) {
        return {kind: "skip"};
    }
    const deltaMs = options.eventTimeMs - lastMs;
    if (deltaMs <= 0) {
        return {kind: "noop"};
    }

    const nextCursor: EnergyCursor = {
        growId: options.cursor.growId,
        startedAt: options.cursor.startedAt,
        lastAccruedAt: iso(options.eventTimeMs),
        devices: options.newDevices,
    };

    if (deltaMs > ENERGY_ACCRUE_GAP_MS) {
        return {kind: "advance", cursor: nextCursor, paused: true, additions: []};
    }

    return {
        kind: "advance",
        cursor: nextCursor,
        paused: false,
        additions: additionsFromPrevious(options.cursor.devices, lastMs, options.eventTimeMs),
    };
}

class CorruptEnergyDayError extends Error {
    constructor() {
        super("corrupt_energy_day");
        this.name = "CorruptEnergyDayError";
    }
}

async function persistAdditions(additions: AccrueAddition[]): Promise<EnergyDayWriteSnapshot[]> {
    const byDate = new Map<string, AccrueAddition[]>();
    for (const addition of additions) {
        const list = byDate.get(addition.date) ?? [];
        list.push(addition);
        byDate.set(addition.date, list);
    }

    const snapshots: EnergyDayWriteSnapshot[] = [];
    const merged: EnergyDayFile[] = [];
    for (const [date, list] of byDate) {
        const inspected = await inspectEnergyDay(date);
        if (inspected.status === "corrupt") {
            logEnergy("corrupt_energy_day");
            throw new CorruptEnergyDayError();
        }
        let day: EnergyDayFile =
            inspected.status === "ok" ? inspected.day : {date, hours: {}};
        snapshots.push({
            date,
            previousRaw: inspected.status === "ok" ? inspected.raw : null,
        });
        for (const addition of list) {
            day = mergeDaySeconds(day, addition.hour, addition.key, addition.level, addition.seconds);
        }
        merged.push(day);
    }

    try {
        for (const day of merged) {
            await writeEnergyDay(day);
        }
    } catch (error) {
        await restoreEnergyDayWrites(snapshots);
        throw error;
    }
    return snapshots;
}

export async function persistAccruePlan(plan: AccruePlan): Promise<void> {
    if (plan.kind === "noop" || plan.kind === "skip") {
        return;
    }
    if (plan.kind === "init") {
        try {
            await writeEnergyCursor(plan.cursor);
        } catch {
            logEnergy("bucket_write_failed");
        }
        return;
    }
    let daySnapshots: EnergyDayWriteSnapshot[] = [];
    if (plan.additions.length > 0) {
        try {
            daySnapshots = await persistAdditions(plan.additions);
        } catch (error) {
            if (!(error instanceof CorruptEnergyDayError)) {
                logEnergy("bucket_write_failed");
            }
            return;
        }
    }
    if (plan.paused) {
        logEnergy("accrue_paused_gap", {}, "info");
    }
    try {
        await writeEnergyCursor(plan.cursor);
    } catch {
        logEnergy("bucket_write_failed");
        await restoreEnergyDayWrites(daySnapshots);
    }
}

async function accrueUnlocked(options: {
    eventTimeMs: number;
    newDevices: GgsDeviceSnapshot[];
}): Promise<void> {
    const grow = await getCurrentGrow();
    let cursor = await readEnergyCursor();
    if (cursor && cursor.growId !== grow.id) {
        try {
            await resetEnergyCurrent();
        } catch {
            logEnergy("energy_reset_failed");
            return;
        }
        cursor = null;
    }
    const plan = planAccrue({
        cursor,
        currentGrowId: grow.id,
        eventTimeMs: options.eventTimeMs,
        newDevices: options.newDevices,
    });
    await persistAccruePlan(plan);
}

export async function accrueEnergyOnIngest(snapshot: GgsLiveIngest): Promise<void> {
    await withEnergyAccrueLock(async () => {
        const now = Date.now();
        await accrueUnlocked({
            eventTimeMs: eventTimeMs(snapshot.updatedAt, now),
            newDevices: snapshot.devices,
        });
    });
}

export async function accrueEnergyPending(nowMs: number = Date.now()): Promise<void> {
    await withEnergyAccrueLock(async () => {
        const live = await readGgsLive();
        if (!live) {
            return;
        }
        await accrueUnlocked({
            eventTimeMs: pendingAccrueEventTimeMs(live.updatedAt, nowMs),
            newDevices: live.devices,
        });
    });
}
