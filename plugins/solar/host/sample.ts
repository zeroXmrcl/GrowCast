import {allocateSolarInstant, type AllocationMode, type BatteryDischargeOrigin} from "./allocation";
import type {SolarInstantSplit} from "./allocation";

export const SAMPLE_NOW_MS = Date.parse("2026-11-17T10:42:00.000Z");
export const SAMPLE_TIMEZONE = "Europe/Berlin";

export type SampleDevice = {
    name: string;
    label: string;
    kind: string;
    watts: number;
};

export type SampleLive = {
    pvW: number;
    batteryW: number;
    batterySoc: number;
    gridW: number;
    houseW: number;
    tentW: number;
    gridMode: number;
    tentDevices: SampleDevice[];
};

export const SAMPLE_LIVE: SampleLive = {
    pvW: 4260,
    batteryW: -1640,
    batterySoc: 68,
    gridW: -700,
    houseW: 1920,
    tentW: 612,
    gridMode: 1,
    tentDevices: [
        {name: "Spider Farmer", label: "Light", kind: "light", watts: 480},
        {name: "Climate", label: "Dehumidifier", kind: "dehumidifier", watts: 80},
        {name: "Intake", label: "Fan", kind: "fan", watts: 52},
    ],
};

export const SAMPLE_TODAY = {
    pvKwh: 20.8,
    houseKwh: 23.1,
    houseOtherKwh: 14.6,
    tentKwh: 8.5,
    tentFromSolarKwh: 8.0,
    tentFromPvKwh: 6.4,
    tentFromBatteryKwh: 1.6,
    tentFromGridKwh: 0.5,
    houseOtherFromSolarKwh: 13.8,
    houseOtherFromGridKwh: 0.8,
    gridImportKwh: 1.9,
    gridExportKwh: 3.3,
    batterySocStart: 38,
};

export function sampleAllocation(
    live: SampleLive = SAMPLE_LIVE,
    mode: AllocationMode = "proportional",
    origin: BatteryDischargeOrigin = "always-solar",
): SolarInstantSplit {
    return allocateSolarInstant({
        pvW: live.pvW,
        batteryW: live.batteryW,
        gridW: live.gridW,
        houseW: live.houseW,
        tentW: live.tentW,
        batterySolarMix: 1,
    }, mode, origin);
}

export type SampleSeriesPoint = {
    t: string;
    pvW: number | null;
    batteryW: number | null;
    batterySoc: number | null;
    gridW: number | null;
    houseW: number | null;
    tentW: number | null;
};

export function sampleHourlySeries(endMs = SAMPLE_NOW_MS, hours = 24): SampleSeriesPoint[] {
    const points: SampleSeriesPoint[] = [];
    for (let i = hours - 1; i >= 0; i -= 1) {
        const tMs = endMs - i * 3_600_000;
        const hour = new Date(tMs).getUTCHours();
        const berlinHour = (hour + 1) % 24;
        const sun = berlinHour < 7 || berlinHour > 17
            ? 0
            : Math.sin(((berlinHour - 7) / 11) * Math.PI);
        const pvW = Math.round(sun * 4800);
        const houseW = berlinHour >= 7 && berlinHour <= 22 ? 1900 : 900;
        const tentW = berlinHour >= 6 && berlinHour <= 21 ? 612 : 80;
        const soc = berlinHour < 8
            ? 38 + berlinHour
            : berlinHour < 16
                ? 55 + (berlinHour - 8) * 4
                : Math.max(10, 95 - (berlinHour - 16) * 8);
        const charge = pvW > houseW ? Math.min(1640, pvW - houseW) : 0;
        const discharge = pvW < tentW * 0.3 && berlinHour >= 20 ? 400 : 0;
        const batteryW = discharge > 0 ? discharge : charge > 0 ? -charge : 0;
        const solarSupply = pvW + Math.max(0, batteryW);
        const gridW = houseW - solarSupply + (batteryW < 0 ? 0 : 0);
        points.push({
            t: new Date(tMs).toISOString(),
            pvW,
            batteryW,
            batterySoc: soc,
            gridW,
            houseW,
            tentW,
        });
    }
    return points;
}

export function sampleGrowCycle(active = true): {
    active: boolean;
    startedAt: string | null;
    endedAt: string | null;
} {
    return active
        ? {active: true, startedAt: "2026-10-18", endedAt: null}
        : {active: false, startedAt: null, endedAt: null};
}
