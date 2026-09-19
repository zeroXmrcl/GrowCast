import {OVERLAY_EASING_ENTER} from "@/lib/overlay-motion";

export type ClimateTick = "plain" | "picker";
export type ClimateTickKind = "temp" | "rh" | "vpd";

export const DEFAULT_CLIMATE_TICK: ClimateTick = "plain";
export const CLIMATE_TICK_EASING = OVERLAY_EASING_ENTER;

type KindSpec = {
    min: number;
    max: number;
    step: number;
    digits: number;
    suffix: string;
};

const SPECS: Record<ClimateTickKind, KindSpec> = {
    temp: {min: 5, max: 45, step: 0.1, digits: 1, suffix: "°"},
    rh: {min: 10, max: 99.9, step: 0.1, digits: 1, suffix: "%"},
    vpd: {min: 0.2, max: 4, step: 0.01, digits: 2, suffix: ""},
};

function series(spec: KindSpec): {values: number[]; labels: string[]} {
    const values: number[] = [];
    const labels: string[] = [];
    const factor = 10 ** spec.digits;
    const min = Math.round(spec.min * factor);
    const max = Math.round(spec.max * factor);
    const step = Math.round(spec.step * factor);
    for (let i = min; i <= max; i += step) {
        const value = i / factor;
        values.push(value);
        labels.push(`${value.toFixed(spec.digits)}${spec.suffix}`);
    }
    return {values, labels};
}

const CACHE: Record<ClimateTickKind, {values: number[]; labels: string[]}> = {
    temp: series(SPECS.temp),
    rh: series(SPECS.rh),
    vpd: series(SPECS.vpd),
};

export function parseClimateTick(value: unknown): ClimateTick {
    return value === "picker" ? "picker" : DEFAULT_CLIMATE_TICK;
}

export function climateTickLabels(kind: ClimateTickKind): readonly string[] {
    return CACHE[kind].labels;
}

export function climateTickIndex(kind: ClimateTickKind, value: number): number {
    const {values} = CACHE[kind];
    let best = 0;
    let dist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < values.length; i += 1) {
        const next = Math.abs(values[i] - value);
        if (next < dist) {
            dist = next;
            best = i;
        }
    }
    return best;
}

export function climateTickDurationMs(distance: number, reducedMotion: boolean): number {
    if (reducedMotion || distance <= 0) {
        return 0;
    }
    return Math.min(560, 200 + distance * 55);
}
