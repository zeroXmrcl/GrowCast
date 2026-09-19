import {kindFromActuatorId, lookupWatts, type EnergyOverride} from "@/lib/energy/catalog";
import {splitBerlinHours} from "@/lib/energy/berlin";
import type {EnergyActuatorRef, EnergyDayFile, EnergyDayHours} from "@/lib/energy/types";
import type {GgsActuatorKind} from "@/lib/ggs-live";

export function secondsToKwh(watts: number, seconds: number): number {
    return (watts * seconds) / 3_600_000;
}

export function costEur(kWh: number, tariff: number | null): number | null {
    if (tariff === null) {
        return null;
    }
    return kWh * tariff;
}

export function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export type DeviceEnergyTotals = {
    key: string;
    seconds: number;
    kWh: number;
};

function kindFromRef(refs: Map<string, EnergyActuatorRef>, key: string): {
    kind: GgsActuatorKind;
    id: string;
} | null {
    const ref = refs.get(key);
    if (ref) {
        return {kind: ref.kind, id: ref.id};
    }
    const sep = key.indexOf(":");
    const id = sep === -1 ? key : key.slice(sep + 1);
    const kind = kindFromActuatorId(id);
    if (!kind) {
        return null;
    }
    return {kind, id};
}

function addHourSlot(
    hourSlot: EnergyDayHours[string] | undefined,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
    devices: Map<string, DeviceEnergyTotals>,
    totals: {kWh: number; seconds: number},
): void {
    if (!hourSlot) {
        return;
    }
    for (const [key, levels] of Object.entries(hourSlot)) {
        const identity = kindFromRef(refs, key);
        const sep = key.indexOf(":");
        const fallbackId = sep === -1 ? key : key.slice(sep + 1);
        let device = devices.get(key);
        if (!device) {
            device = {key, seconds: 0, kWh: 0};
            devices.set(key, device);
        }
        for (const [level, levelSeconds] of Object.entries(levels)) {
            if (!(levelSeconds > 0)) {
                continue;
            }
            const watts = lookupWatts({
                key,
                kind: identity?.kind ?? "outlet",
                id: identity?.id ?? fallbackId,
                level,
                on: true,
                overrides,
            });
            const energy = secondsToKwh(watts, levelSeconds);
            device.seconds += levelSeconds;
            device.kWh += energy;
            totals.seconds += levelSeconds;
            totals.kWh += energy;
        }
    }
}

export function totalsForDays(
    days: Iterable<EnergyDayFile | {hours: EnergyDayHours}>,
    dateSet: Set<string> | null,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
): {devices: Map<string, DeviceEnergyTotals>; kWh: number; seconds: number} {
    const devices = new Map<string, DeviceEnergyTotals>();
    const totals = {kWh: 0, seconds: 0};

    for (const day of days) {
        const date = "date" in day ? day.date : null;
        if (dateSet && date && !dateSet.has(date)) {
            continue;
        }
        for (const hourSlot of Object.values(day.hours)) {
            addHourSlot(hourSlot, refs, overrides, devices, totals);
        }
    }

    return {devices, kWh: totals.kWh, seconds: totals.seconds};
}

/** Sum stored hour buckets that overlap [t1Ms, t2Ms). Align t1 to an hour start to match the 24h series. */
export function totalsForHourRange(
    days: Map<string, EnergyDayFile>,
    t1Ms: number,
    t2Ms: number,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
): {devices: Map<string, DeviceEnergyTotals>; kWh: number; seconds: number} {
    const devices = new Map<string, DeviceEnergyTotals>();
    const totals = {kWh: 0, seconds: 0};
    const seen = new Set<string>();
    for (const slice of splitBerlinHours(t1Ms, t2Ms)) {
        const hourKey = `${slice.date}:${slice.hour}`;
        if (seen.has(hourKey)) {
            continue;
        }
        seen.add(hourKey);
        addHourSlot(days.get(slice.date)?.hours[String(slice.hour)], refs, overrides, devices, totals);
    }
    return {devices, kWh: totals.kWh, seconds: totals.seconds};
}

