import type {GgsActuatorKind} from "@/lib/ggs-live";

const LIGHT_SLOPE = 3.011;
const LIGHT_INTERCEPT = 3.88;

/** Oscillation-on clip fan gears 1–10 (GGS does not report osc). */
export const CLIP_FAN_OSC_ON_WATTS: Readonly<Record<string, number>> = {
    "1": 2.8,
    "2": 3.2,
    "3": 3.6,
    "4": 4.1,
    "5": 4.5,
    "6": 5.2,
    "7": 6.0,
    "8": 6.7,
    "9": 7.5,
    "10": 8.2,
};

export const HEATER_GEAR_WATTS: Readonly<Record<string, number>> = {
    "1": 41,
    "2": 76,
    "3": 112,
    "4": 148,
    "5": 183,
    "6": 219,
    "7": 255,
    "8": 290,
    "9": 326,
    "10": 540,
};

export const HUMIDIFIER_GEAR_WATTS: Readonly<Record<string, number>> = {
    "1": 19,
    "2": 22,
    "3": 26,
    "4": 30,
};

/** GGS dehumidifier 1 = LOW, 2 = HIGH. */
export const DEHUMIDIFIER_WATTS: Readonly<Record<string, number>> = {
    "1": 215,
    "2": 230,
};

export type EnergyOverride = {
    key: string;
    watts?: number;
    wattsByLevel?: Record<string, number>;
};

export function actuatorKey(serial: string, actuatorId: string): string {
    return `${serial}:${actuatorId}`;
}

export function kindFromActuatorId(id: string): GgsActuatorKind | null {
    const normalized = id.trim().toLowerCase();
    if (normalized === "light" || normalized === "light2") {
        return "light";
    }
    if (normalized === "fan") {
        return "fan";
    }
    if (normalized === "blower") {
        return "blower";
    }
    if (normalized === "humidifier") {
        return "humidifier";
    }
    if (normalized === "dehumidifier") {
        return "dehumidifier";
    }
    if (normalized === "heater") {
        return "heater";
    }
    if (normalized === "outlet" || normalized.startsWith("outlet-")) {
        return "outlet";
    }
    return null;
}

export function lightWatts(pct: number): number {
    return Math.round(LIGHT_SLOPE * Math.max(pct, 10) + LIGHT_INTERCEPT);
}

export function blowerWatts(pct: number): number {
    if (pct < 25) {
        return 0;
    }
    return 3.1 + 24.2 * (pct / 100) ** 3;
}

function finiteLevelWatts(table: Readonly<Record<string, number>>, level: string): number | null {
    if (!Object.prototype.hasOwnProperty.call(table, level)) {
        return null;
    }
    const watts = table[level];
    return typeof watts === "number" && Number.isFinite(watts) ? watts : null;
}

export function catalogWatts(
    kind: GgsActuatorKind,
    _id: string,
    level: string,
    on: boolean,
): number {
    if (!on) {
        return 0;
    }

    switch (kind) {
        case "light": {
            const pct = Number(level);
            if (!Number.isFinite(pct) || pct <= 0) {
                return 0;
            }
            return lightWatts(pct);
        }
        case "blower": {
            const pct = Number(level);
            if (!Number.isFinite(pct)) {
                return 0;
            }
            return blowerWatts(pct);
        }
        case "fan":
            return finiteLevelWatts(CLIP_FAN_OSC_ON_WATTS, level) ?? 0;
        case "heater":
            return finiteLevelWatts(HEATER_GEAR_WATTS, level) ?? 0;
        case "humidifier":
            return finiteLevelWatts(HUMIDIFIER_GEAR_WATTS, level) ?? 0;
        case "dehumidifier":
            return finiteLevelWatts(DEHUMIDIFIER_WATTS, level) ?? 0;
        default:
            return 0;
    }
}

function overrideLevelWatts(override: EnergyOverride | undefined, level: string): number | null {
    if (!override?.wattsByLevel || !Object.prototype.hasOwnProperty.call(override.wattsByLevel, level)) {
        return null;
    }
    const watts = override.wattsByLevel[level];
    return typeof watts === "number" && Number.isFinite(watts) ? watts : 0;
}

export function lookupWatts(options: {
    key: string;
    kind: GgsActuatorKind;
    id: string;
    level: string;
    on: boolean;
    overrides: readonly EnergyOverride[];
}): number {
    if (!options.on) {
        return 0;
    }
    const override = options.overrides.find((item) => item.key === options.key);
    const fromLevel = overrideLevelWatts(override, options.level);
    if (fromLevel !== null) {
        return fromLevel;
    }
    if (override && typeof override.watts === "number" && Number.isFinite(override.watts)) {
        return override.watts;
    }
    return catalogWatts(options.kind, options.id, options.level, true);
}
