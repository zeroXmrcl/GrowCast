import {actuatorKey, catalogHumidifierMlPerHour, kindFromActuatorId} from "@/lib/energy/catalog";
import {
    berlinDateOnly,
    berlinDateWindow,
    berlinDayStartMs,
    berlinHour,
    berlinHourStartAtOrBefore,
    nextBerlinHourBoundary,
    shiftDateOnly,
    splitBerlinHours,
} from "@/lib/energy/berlin";
import {round1} from "@/lib/energy/math";
import type {
    EnergyActuatorHours,
    EnergyActuatorRef,
    EnergyDayFile,
    EnergyWaterCell,
    EnergyWaterView,
    EnergyWaterWindows,
} from "@/lib/energy/types";
import type {GgsDeviceSnapshot} from "@/lib/ggs-live";

function iso(ms: number): string {
    return new Date(ms).toISOString();
}

function kindFromKey(refs: Map<string, EnergyActuatorRef>, key: string) {
    const ref = refs.get(key);
    if (ref) {
        return ref.kind;
    }
    const sep = key.lastIndexOf(":");
    const id = sep === -1 ? key : key.slice(sep + 1);
    return kindFromActuatorId(id);
}

function isHumidifierKey(refs: Map<string, EnergyActuatorRef>, key: string): boolean {
    return kindFromKey(refs, key) === "humidifier";
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

function litersFromLevels(levels: Record<string, number> | undefined): number {
    if (!levels) {
        return 0;
    }
    let ml = 0;
    for (const [level, seconds] of Object.entries(levels)) {
        if (!(seconds > 0)) {
            continue;
        }
        ml += (catalogHumidifierMlPerHour(level) * seconds) / 3600;
    }
    return ml / 1000;
}

function collectHumidifierKeys(
    days: Map<string, EnergyDayFile>,
    refs: Map<string, EnergyActuatorRef>,
    liveDevices: GgsDeviceSnapshot[] | undefined,
): Set<string> {
    const keys = new Set<string>();
    for (const device of liveDevices ?? []) {
        for (const actuator of device.actuators) {
            if (actuator.kind === "humidifier") {
                keys.add(actuatorKey(device.serial, actuator.id));
            }
        }
    }
    for (const day of days.values()) {
        for (const field of [day.hours, day.alerts] as const) {
            if (!field) {
                continue;
            }
            for (const slot of Object.values(field)) {
                for (const key of Object.keys(slot)) {
                    if (isHumidifierKey(refs, key)) {
                        keys.add(key);
                    }
                }
            }
        }
    }
    return keys;
}

function hourCell(
    days: Map<string, EnergyDayFile>,
    keys: Set<string>,
    date: string,
    hour: number,
): EnergyWaterCell {
    let liters = 0;
    let empty = false;
    for (const key of keys) {
        liters += litersFromLevels(slotFor(days, date, hour, "hours")?.[key]);
        const alerts = slotFor(days, date, hour, "alerts")?.[key];
        if (alerts && Object.values(alerts).some((seconds) => seconds > 0)) {
            empty = true;
        }
    }
    return {liters, empty};
}

function finishView(
    kind: EnergyWaterView["kind"],
    columns: {t: string; hour: number}[],
    cells: EnergyWaterCell[],
): EnergyWaterView {
    const liters = cells.reduce((sum, cell) => sum + cell.liters, 0);
    return {kind, liters: round1(liters), columns, cells};
}

function nextSixHourBoundary(ms: number): number {
    let t = ms;
    for (let i = 0; i < 6; i += 1) {
        t = nextBerlinHourBoundary(t);
    }
    return t;
}

function growStartDate(startedAt: string | null, days: Map<string, EnergyDayFile>, today: string): string {
    if (startedAt) {
        const ms = Date.parse(startedAt);
        if (Number.isFinite(ms)) {
            const date = berlinDateOnly(ms);
            return date > today ? today : date;
        }
    }
    let first: string | null = null;
    for (const date of days.keys()) {
        if (!first || date < first) {
            first = date;
        }
    }
    return first ?? today;
}

function datesInclusive(startDate: string, endDate: string): string[] {
    const start = startDate <= endDate ? startDate : endDate;
    const end = startDate <= endDate ? endDate : startDate;
    const dates: string[] = [];
    let date = start;
    let guard = 0;
    while (date <= end && guard < 4000) {
        dates.push(date);
        date = shiftDateOnly(date, 1);
        guard += 1;
    }
    return dates.length > 0 ? dates : [endDate];
}

function hourWindow(
    days: Map<string, EnergyDayFile>,
    keys: Set<string>,
    nowMs: number,
): EnergyWaterView {
    const startMs = berlinHourStartAtOrBefore(nowMs - 24 * 60 * 60 * 1000);
    const columns: {t: string; hour: number}[] = [];
    const cells: EnergyWaterCell[] = [];
    let t = startMs;
    let guard = 0;
    while (t <= nowMs && guard < 40) {
        guard += 1;
        const date = berlinDateOnly(t);
        const hour = berlinHour(t);
        columns.push({t: iso(t), hour});
        cells.push(hourCell(days, keys, date, hour));
        const boundary = nextBerlinHourBoundary(t);
        if (boundary > nowMs) {
            break;
        }
        t = boundary;
    }
    return finishView("hour", columns, cells);
}

function sixHourWindow(
    days: Map<string, EnergyDayFile>,
    keys: Set<string>,
    startMs: number,
    nowMs: number,
): EnergyWaterView {
    const columns: {t: string; hour: number}[] = [];
    const cells: EnergyWaterCell[] = [];
    let t = startMs;
    let guard = 0;
    while (t <= nowMs && guard < 200) {
        guard += 1;
        const boundary = nextSixHourBoundary(t);
        const end = Math.min(boundary, nowMs);
        let liters = 0;
        let empty = false;
        for (const slice of splitBerlinHours(t, end)) {
            const cell = hourCell(days, keys, slice.date, slice.hour);
            liters += cell.liters;
            if (cell.empty) {
                empty = true;
            }
        }
        columns.push({t: iso(t), hour: berlinHour(t)});
        cells.push({liters, empty});
        if (boundary > nowMs) {
            break;
        }
        t = boundary;
    }
    return finishView("slot6h", columns, cells);
}

function dayWindow(
    days: Map<string, EnergyDayFile>,
    keys: Set<string>,
    dates: string[],
): EnergyWaterView {
    const columns: {t: string; hour: number}[] = [];
    const cells: EnergyWaterCell[] = [];
    for (const date of dates) {
        const day = days.get(date);
        const hours = new Set<string>([
            ...Object.keys(day?.hours ?? {}),
            ...Object.keys(day?.alerts ?? {}),
        ]);
        for (let hour = 0; hour < 24; hour += 1) {
            hours.add(String(hour));
        }
        let liters = 0;
        let empty = false;
        for (const hourText of hours) {
            const hour = Number(hourText);
            if (!Number.isInteger(hour)) {
                continue;
            }
            const cell = hourCell(days, keys, date, hour);
            liters += cell.liters;
            if (cell.empty) {
                empty = true;
            }
        }
        columns.push({t: iso(berlinDayStartMs(date)), hour: 0});
        cells.push({liters, empty});
    }
    return finishView("day", columns, cells);
}

export function buildEnergyWaterView(options: {
    days: Map<string, EnergyDayFile>;
    refs: Map<string, EnergyActuatorRef>;
    liveDevices?: GgsDeviceSnapshot[];
    startedAt?: string | null;
    nowMs: number;
}): EnergyWaterWindows | null {
    const keys = collectHumidifierKeys(options.days, options.refs, options.liveDevices);
    if (keys.size === 0) {
        return null;
    }
    const today = berlinDateOnly(options.nowMs);
    return {
        today: hourWindow(options.days, keys, options.nowMs),
        "7d": sixHourWindow(
            options.days,
            keys,
            berlinDayStartMs(shiftDateOnly(today, -6)),
            options.nowMs,
        ),
        "30d": dayWindow(options.days, keys, berlinDateWindow(today, 30).slice().reverse()),
        grow: dayWindow(
            options.days,
            keys,
            datesInclusive(growStartDate(options.startedAt ?? null, options.days, today), today),
        ),
    };
}
