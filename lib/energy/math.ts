import {kindFromActuatorId, lookupWatts, type EnergyOverride} from "@/lib/energy/catalog";
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

export function totalsForDays(
    days: Iterable<EnergyDayFile | {hours: EnergyDayHours}>,
    dateSet: Set<string> | null,
    refs: Map<string, EnergyActuatorRef>,
    overrides: readonly EnergyOverride[],
): {devices: Map<string, DeviceEnergyTotals>; kWh: number; seconds: number} {
    const devices = new Map<string, DeviceEnergyTotals>();
    let kWh = 0;
    let seconds = 0;

    for (const day of days) {
        const date = "date" in day ? day.date : null;
        if (dateSet && date && !dateSet.has(date)) {
            continue;
        }
        for (const hourSlot of Object.values(day.hours)) {
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
                    seconds += levelSeconds;
                    kWh += energy;
                }
            }
        }
    }

    return {devices, kWh, seconds};
}

