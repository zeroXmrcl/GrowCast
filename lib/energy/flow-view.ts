import {actuatorKey, kindFromActuatorId} from "@/lib/energy/catalog";
import {
    berlinDateOnly,
    berlinHour,
    berlinHourStartAtOrBefore,
    nextBerlinHourBoundary,
} from "@/lib/energy/berlin";
import type {
    EnergyActuatorHours,
    EnergyActuatorRef,
    EnergyDayFile,
    EnergyFlowCell,
    EnergyFlowMark,
    EnergyFlowRow,
    EnergyFlowView,
} from "@/lib/energy/types";
import type {GgsActuatorKind, GgsDeviceSnapshot} from "@/lib/ggs-live";
import {actuatorLabel, alarmLevelText} from "@/lib/live-climate-view";

function iso(ms: number): string {
    return new Date(ms).toISOString();
}

function sumLevels(levels: Record<string, number> | undefined): number {
    if (!levels) {
        return 0;
    }
    let total = 0;
    for (const seconds of Object.values(levels)) {
        if (seconds > 0) {
            total += seconds;
        }
    }
    return total;
}

function markFromCodes(
    levels: Record<string, number> | undefined,
    kind: GgsActuatorKind,
): EnergyFlowMark | null {
    if (!levels) {
        return null;
    }
    let bestCode: number | null = null;
    let bestSeconds = 0;
    for (const [code, seconds] of Object.entries(levels)) {
        if (seconds > bestSeconds) {
            bestSeconds = seconds;
            bestCode = Number(code);
        }
    }
    if (bestCode === null || !Number.isInteger(bestCode)) {
        return null;
    }
    return alarmLevelText(kind, bestCode);
}

function identityFromKey(
    refs: Map<string, EnergyActuatorRef>,
    key: string,
): {id: string; label: string; name: string; kind: GgsActuatorKind} {
    const ref = refs.get(key);
    if (ref) {
        return {
            id: ref.id,
            label: actuatorLabel(ref),
            name: ref.name,
            kind: ref.kind,
        };
    }
    const sep = key.lastIndexOf(":");
    const id = sep === -1 ? key : key.slice(sep + 1);
    const kind = kindFromActuatorId(id) ?? "outlet";
    return {
        id,
        label: actuatorLabel({id, kind, label: id}),
        name: "Device",
        kind,
    };
}

function slotFor(
    days: Map<string, EnergyDayFile>,
    date: string,
    hour: number,
    field: "hours" | "alerts",
): EnergyActuatorHours | undefined {
    const day = days.get(date);
    if (!day) {
        return undefined;
    }
    const table = field === "hours" ? day.hours : day.alerts;
    return table?.[String(hour)];
}

function collectWindowKeys(
    days: Map<string, EnergyDayFile>,
    columns: {date: string; hour: number}[],
): Set<string> {
    const keys = new Set<string>();
    for (const column of columns) {
        for (const field of ["hours", "alerts"] as const) {
            const slot = slotFor(days, column.date, column.hour, field);
            if (!slot) {
                continue;
            }
            for (const key of Object.keys(slot)) {
                keys.add(key);
            }
        }
    }
    return keys;
}

function orderedKeys(
    liveDevices: GgsDeviceSnapshot[] | undefined,
    windowKeys: Set<string>,
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const device of liveDevices ?? []) {
        for (const actuator of device.actuators) {
            const key = actuatorKey(device.serial, actuator.id);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(key);
        }
    }
    const rest = [...windowKeys].filter((key) => !seen.has(key)).sort();
    return [...out, ...rest];
}

export function buildEnergyFlowView(options: {
    days: Map<string, EnergyDayFile>;
    refs: Map<string, EnergyActuatorRef>;
    liveDevices?: GgsDeviceSnapshot[];
    nowMs: number;
}): EnergyFlowView {
    const startMs = berlinHourStartAtOrBefore(options.nowMs - 24 * 60 * 60 * 1000);
    const columns: {t: string; hour: number; date: string; startMs: number; endMs: number}[] = [];
    let t = startMs;
    let guard = 0;
    while (t <= options.nowMs && guard < 40) {
        guard += 1;
        const boundary = nextBerlinHourBoundary(t);
        const end = Math.min(boundary, options.nowMs);
        columns.push({
            t: iso(t),
            hour: berlinHour(t),
            date: berlinDateOnly(t),
            startMs: t,
            endMs: end,
        });
        if (boundary > options.nowMs) {
            break;
        }
        t = boundary;
    }
    const windowKeys = collectWindowKeys(
        options.days,
        columns.map((column) => ({date: column.date, hour: column.hour})),
    );
    const keys = orderedKeys(options.liveDevices, windowKeys);
    const rows: EnergyFlowRow[] = keys.map((key) => {
        const identity = identityFromKey(options.refs, key);
        const cells: EnergyFlowCell[] = columns.map((column) => {
            const divisor = Math.max(1, (column.endMs - column.startMs) / 1000);
            const dutySeconds = sumLevels(
                slotFor(options.days, column.date, column.hour, "hours")?.[key],
            );
            const alertLevels = slotFor(options.days, column.date, column.hour, "alerts")?.[key];
            return {
                duty: Math.min(1, dutySeconds / divisor),
                alert: Math.min(1, sumLevels(alertLevels) / divisor),
                mark: markFromCodes(alertLevels, identity.kind),
            };
        });
        return {...identity, cells};
    });
    return {
        columns: columns.map((column) => ({t: column.t, hour: column.hour})),
        rows,
    };
}
