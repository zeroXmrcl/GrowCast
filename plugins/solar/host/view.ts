import {
    allocateSolarInstant,
    type AllocationMode,
    type BatteryDischargeOrigin,
    type SolarInstantSplit,
} from "./allocation";
import {
    averageWattsInBucket,
    bucketKindFor,
    daysInMsRange,
    integrateWattsToKwh,
    listBucketStarts,
    parseSolarRange,
    rangeWindowMs,
    solarKwhValueEur,
    tentSavings,
    type GrowCycleWindow,
    type SolarRangeId,
    type TentSavings,
    type WattPoint,
} from "./ranges";
import {SAMPLE_LIVE, SAMPLE_TODAY, sampleAllocation, sampleGrowCycle, sampleHourlySeries, SAMPLE_NOW_MS, SAMPLE_TIMEZONE} from "./sample";

export type TentDeviceLoad = {
    name: string;
    label: string;
    kind: string;
    watts: number | null;
};

export type SolarPublicFlags = {
    pv: boolean;
    battery: boolean;
    grid: boolean;
    tentShare: boolean;
};

export type SolarTotals = {
    pvKwh: number | null;
    houseKwh: number | null;
    tentKwh: number | null;
    tentFromSolarKwh: number | null;
    tentFromPvKwh: number | null;
    tentFromBatteryKwh: number | null;
    tentFromGridKwh: number | null;
    houseOtherFromSolarKwh: number | null;
    houseOtherFromGridKwh: number | null;
    gridImportKwh: number | null;
    gridExportKwh: number | null;
};

export type SolarBucket = {
    t: string;
    tentFromPvW: number | null;
    tentFromBatteryW: number | null;
    tentFromGridW: number | null;
    houseOtherFromSolarW: number | null;
    houseOtherFromGridW: number | null;
    pvW: number | null;
    batterySoc: number | null;
};

export type SolarViewDto = {
    range: SolarRangeId;
    sample: boolean;
    timezone: string;
    updatedAt: string | null;
    stale: boolean;
    grow: GrowCycleWindow;
    public: SolarPublicFlags;
    live: {
        pvW: number | null;
        batteryW: number | null;
        batterySoc: number | null;
        gridW: number | null;
        houseW: number | null;
        tentW: number | null;
        gridMode: number | null;
        allocation: SolarInstantSplit;
        tentDevices: TentDeviceLoad[];
        system: {
            name: string;
            pvPeakW: number | null;
            batteryWh: number | null;
            allocationMode: AllocationMode;
            batteryDischargeOrigin: BatteryDischargeOrigin;
        };
    };
    today: SolarTotals;
    totals: SolarTotals;
    savings: TentSavings;
    buckets: SolarBucket[];
    growDisabledHint: string | null;
};

export type SolarSeriesMaps = Record<string, Array<{t: string; value: number | null}>>;

export type SolarViewInput = {
    range: string | null;
    nowMs: number;
    timezone: string;
    sample?: boolean;
    grow: GrowCycleWindow;
    config: Record<string, string | number | boolean>;
    liveMetrics: Record<string, number | null>;
    liveState: Record<string, unknown> | null;
    observedAt: string | null;
    stale: boolean;
    series: SolarSeriesMaps;
};

function asMode(value: unknown): AllocationMode {
    return value === "tent-first" || value === "tent-last" ? value : "proportional";
}

function asOrigin(value: unknown): BatteryDischargeOrigin {
    return value === "always-grid" || value === "mix" ? value : "always-solar";
}

function asNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flag(value: unknown, fallback = true): boolean {
    if (value === false || value === "false" || value === 0) {
        return false;
    }
    if (value === true || value === "true" || value === 1) {
        return true;
    }
    return fallback;
}

function metricSeries(series: SolarSeriesMaps, key: string): WattPoint[] {
    return (series[key] ?? []).map((point) => ({
        tMs: Date.parse(point.t),
        watts: point.value,
    })).filter((point) => Number.isFinite(point.tMs));
}

function splitAt(series: SolarSeriesMaps, index: number, mode: AllocationMode, origin: BatteryDischargeOrigin): SolarInstantSplit {
    const read = (key: string): number | null => {
        const point = series[key]?.[index];
        return point && typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null;
    };
    const storedSolar = read("tent.from_solar");
    const storedGrid = read("tent.from_grid");
    const storedPv = read("tent.from_pv");
    const storedBatt = read("tent.from_battery");
    if (storedSolar !== null || storedGrid !== null) {
        return {
            solarSupplyW: null,
            gridSupplyW: null,
            tentFromSolarW: storedSolar,
            tentFromPvW: storedPv,
            tentFromBatteryW: storedBatt,
            tentFromGridW: storedGrid,
            houseOtherFromSolarW: null,
            houseOtherFromGridW: null,
            exportW: null,
            houseOtherW: null,
            tentShareOfHouse: null,
            solarShareOfTent: null,
            solarShareOfHouse: null,
            missing: [],
        };
    }
    return allocateSolarInstant({
        pvW: read("pv.power"),
        batteryW: read("battery.power"),
        gridW: read("grid.power"),
        houseW: read("house.power"),
        tentW: read("tent.power"),
        batterySolarMix: 1,
    }, mode, origin);
}

function tentDevicesFromState(state: Record<string, unknown> | null): TentDeviceLoad[] {
    if (!state) {
        return [];
    }
    const direct = state.tentDevices;
    if (Array.isArray(direct)) {
        return direct.filter((row) => row && typeof row === "object") as TentDeviceLoad[];
    }
    const energy = state.tentEnergy;
    if (energy && typeof energy === "object") {
        const devices = (energy as {energy?: {devices?: unknown}; devices?: unknown}).energy?.devices
            ?? (energy as {devices?: unknown}).devices;
        if (Array.isArray(devices)) {
            return devices.filter((row) => row && typeof row === "object") as TentDeviceLoad[];
        }
    }
    return [];
}

function emptyTotals(): SolarTotals {
    return {
        pvKwh: null,
        houseKwh: null,
        tentKwh: null,
        tentFromSolarKwh: null,
        tentFromPvKwh: null,
        tentFromBatteryKwh: null,
        tentFromGridKwh: null,
        houseOtherFromSolarKwh: null,
        houseOtherFromGridKwh: null,
        gridImportKwh: null,
        gridExportKwh: null,
    };
}

function totalsFromSeries(
    series: SolarSeriesMaps,
    startMs: number,
    endMs: number,
    mode: AllocationMode,
    origin: BatteryDischargeOrigin,
): SolarTotals {
    const pv = integrateWattsToKwh(metricSeries(series, "pv.power"), startMs, endMs);
    const house = integrateWattsToKwh(metricSeries(series, "house.power"), startMs, endMs);
    const tent = integrateWattsToKwh(metricSeries(series, "tent.power"), startMs, endMs);
    const fromSolar = integrateWattsToKwh(derivedTent(series, "tent.from_solar", mode, origin, "tentFromSolarW"), startMs, endMs);
    const fromPv = integrateWattsToKwh(derivedTent(series, "tent.from_pv", mode, origin, "tentFromPvW"), startMs, endMs);
    const fromBatt = integrateWattsToKwh(derivedTent(series, "tent.from_battery", mode, origin, "tentFromBatteryW"), startMs, endMs);
    const fromGrid = integrateWattsToKwh(derivedTent(series, "tent.from_grid", mode, origin, "tentFromGridW"), startMs, endMs);
    const houseSolar = integrateWattsToKwh(derivedTent(series, "house.other.solar", mode, origin, "houseOtherFromSolarW"), startMs, endMs);
    const houseGrid = integrateWattsToKwh(derivedTent(series, "house.other.grid", mode, origin, "houseOtherFromGridW"), startMs, endMs);
    const gridSeries = metricSeries(series, "grid.power");
    const importPts = gridSeries.map((point) => ({tMs: point.tMs, watts: point.watts === null ? null : Math.max(0, point.watts)}));
    const exportPts = gridSeries.map((point) => ({tMs: point.tMs, watts: point.watts === null ? null : Math.max(0, -point.watts)}));
    const tentKwh = fromSolar !== null && fromGrid !== null ? fromSolar + fromGrid : tent;
    return {
        pvKwh: pv,
        houseKwh: house,
        tentKwh: tentKwh,
        tentFromSolarKwh: fromSolar,
        tentFromPvKwh: fromPv,
        tentFromBatteryKwh: fromBatt,
        tentFromGridKwh: fromGrid,
        houseOtherFromSolarKwh: houseSolar,
        houseOtherFromGridKwh: houseGrid,
        gridImportKwh: integrateWattsToKwh(importPts, startMs, endMs),
        gridExportKwh: integrateWattsToKwh(exportPts, startMs, endMs),
    };
}

function derivedTent(
    series: SolarSeriesMaps,
    storedKey: string,
    mode: AllocationMode,
    origin: BatteryDischargeOrigin,
    field: keyof SolarInstantSplit,
): WattPoint[] {
    const stored = series[storedKey];
    if (stored && stored.length > 0) {
        return stored.map((point) => ({tMs: Date.parse(point.t), watts: point.value})).filter((point) => Number.isFinite(point.tMs));
    }
    const template = series["pv.power"] ?? series["house.power"] ?? [];
    return template.map((point, index) => {
        const split = splitAt(series, index, mode, origin);
        const value = split[field];
        return {tMs: Date.parse(point.t), watts: typeof value === "number" ? value : null};
    }).filter((point) => Number.isFinite(point.tMs));
}

function bucketsFromSeries(
    series: SolarSeriesMaps,
    startMs: number,
    endMs: number,
    range: SolarRangeId,
    timeZone: string,
    mode: AllocationMode,
    origin: BatteryDischargeOrigin,
): SolarBucket[] {
    const kind = bucketKindFor(range, endMs - startMs);
    const starts = listBucketStarts(startMs, endMs, kind, timeZone);
    const step = kind === "hour" ? 3_600_000 : kind === "slot6h" ? 6 * 3_600_000 : 24 * 3_600_000;
    const tentPv = derivedTent(series, "tent.from_pv", mode, origin, "tentFromPvW");
    const tentBatt = derivedTent(series, "tent.from_battery", mode, origin, "tentFromBatteryW");
    const tentGrid = derivedTent(series, "tent.from_grid", mode, origin, "tentFromGridW");
    const houseSolar = derivedTent(series, "house.other.solar", mode, origin, "houseOtherFromSolarW");
    const houseGrid = derivedTent(series, "house.other.grid", mode, origin, "houseOtherFromGridW");
    const pv = metricSeries(series, "pv.power");
    const soc = metricSeries(series, "battery.soc");
    return starts.map((start) => ({
        t: new Date(start).toISOString(),
        tentFromPvW: averageWattsInBucket(tentPv, start, start + step),
        tentFromBatteryW: averageWattsInBucket(tentBatt, start, start + step),
        tentFromGridW: averageWattsInBucket(tentGrid, start, start + step),
        houseOtherFromSolarW: averageWattsInBucket(houseSolar, start, start + step),
        houseOtherFromGridW: averageWattsInBucket(houseGrid, start, start + step),
        pvW: averageWattsInBucket(pv, start, start + step),
        batterySoc: averageWattsInBucket(soc, start, start + step),
    }));
}

function seriesFromSample(endMs: number, hours: number): SolarSeriesMaps {
    const points = sampleHourlySeries(endMs, hours);
    const keys = ["pv.power", "battery.power", "battery.soc", "grid.power", "house.power", "tent.power"] as const;
    const map: SolarSeriesMaps = {};
    for (const key of keys) {
        map[key] = [];
    }
    for (const point of points) {
        const split = allocateSolarInstant({
            pvW: point.pvW,
            batteryW: point.batteryW,
            gridW: point.gridW,
            houseW: point.houseW,
            tentW: point.tentW,
            batterySolarMix: 1,
        });
        map["pv.power"].push({t: point.t, value: point.pvW});
        map["battery.power"].push({t: point.t, value: point.batteryW});
        map["battery.soc"].push({t: point.t, value: point.batterySoc});
        map["grid.power"].push({t: point.t, value: point.gridW});
        map["house.power"].push({t: point.t, value: point.houseW});
        map["tent.power"].push({t: point.t, value: point.tentW});
        (map["tent.from_solar"] ??= []).push({t: point.t, value: split.tentFromSolarW});
        (map["tent.from_pv"] ??= []).push({t: point.t, value: split.tentFromPvW});
        (map["tent.from_battery"] ??= []).push({t: point.t, value: split.tentFromBatteryW});
        (map["tent.from_grid"] ??= []).push({t: point.t, value: split.tentFromGridW});
        (map["house.other.solar"] ??= []).push({t: point.t, value: split.houseOtherFromSolarW});
        (map["house.other.grid"] ??= []).push({t: point.t, value: split.houseOtherFromGridW});
    }
    return map;
}

export function buildSolarView(input: SolarViewInput): SolarViewDto {
    const range = parseSolarRange(input.range);
    const timezone = input.timezone || SAMPLE_TIMEZONE;
    const mode = asMode(input.config.allocationMode);
    const origin = asOrigin(input.config.batteryDischargeOrigin);
    const grow = input.grow;
    const window = rangeWindowMs(range, input.nowMs, grow, timezone);
    const valueEur = solarKwhValueEur(input.config.solarKwhValueMode, input.config.feedInTariffEurPerKwh);
    const gridTariff = asNumber(input.config.gridTariffEurPerKwh);
    const publicFlags: SolarPublicFlags = {
        pv: flag(input.config.publicPv),
        battery: flag(input.config.publicBattery),
        grid: flag(input.config.publicGrid),
        tentShare: flag(input.config.publicTentShare),
    };

    if (input.sample) {
        const nowMs = SAMPLE_NOW_MS;
        const sampleGrow = sampleGrowCycle(true);
        const sampleWindow = rangeWindowMs(range, nowMs, sampleGrow, SAMPLE_TIMEZONE);
        const hours = range === "30d" || range === "grow" ? 24 * 30 : range === "7d" ? 24 * 7 : 24;
        const series = seriesFromSample(nowMs, hours);
        const live = SAMPLE_LIVE;
        const allocation = sampleAllocation(live, mode, origin);
        const totals = range === "live" || !sampleWindow.ok
            ? {
                pvKwh: SAMPLE_TODAY.pvKwh,
                houseKwh: SAMPLE_TODAY.houseKwh,
                tentKwh: SAMPLE_TODAY.tentKwh,
                tentFromSolarKwh: SAMPLE_TODAY.tentFromSolarKwh,
                tentFromPvKwh: SAMPLE_TODAY.tentFromPvKwh,
                tentFromBatteryKwh: SAMPLE_TODAY.tentFromBatteryKwh,
                tentFromGridKwh: SAMPLE_TODAY.tentFromGridKwh,
                houseOtherFromSolarKwh: SAMPLE_TODAY.houseOtherFromSolarKwh,
                houseOtherFromGridKwh: SAMPLE_TODAY.houseOtherFromGridKwh,
                gridImportKwh: SAMPLE_TODAY.gridImportKwh,
                gridExportKwh: SAMPLE_TODAY.gridExportKwh,
            }
            : totalsFromSeries(series, sampleWindow.startMs, sampleWindow.endMs, mode, origin);
        const today = {
            pvKwh: SAMPLE_TODAY.pvKwh,
            houseKwh: SAMPLE_TODAY.houseKwh,
            tentKwh: SAMPLE_TODAY.tentKwh,
            tentFromSolarKwh: SAMPLE_TODAY.tentFromSolarKwh,
            tentFromPvKwh: SAMPLE_TODAY.tentFromPvKwh,
            tentFromBatteryKwh: SAMPLE_TODAY.tentFromBatteryKwh,
            tentFromGridKwh: SAMPLE_TODAY.tentFromGridKwh,
            houseOtherFromSolarKwh: SAMPLE_TODAY.houseOtherFromSolarKwh,
            houseOtherFromGridKwh: SAMPLE_TODAY.houseOtherFromGridKwh,
            gridImportKwh: SAMPLE_TODAY.gridImportKwh,
            gridExportKwh: SAMPLE_TODAY.gridExportKwh,
        };
        return {
            range,
            sample: true,
            timezone: SAMPLE_TIMEZONE,
            updatedAt: new Date(nowMs).toISOString(),
            stale: false,
            grow: sampleGrow,
            public: publicFlags,
            live: {
                pvW: live.pvW,
                batteryW: live.batteryW,
                batterySoc: live.batterySoc,
                gridW: live.gridW,
                houseW: live.houseW,
                tentW: live.tentW,
                gridMode: live.gridMode,
                allocation,
                tentDevices: live.tentDevices,
                system: {
                    name: "Home energy system",
                    pvPeakW: 11000,
                    batteryWh: 14000,
                    allocationMode: mode,
                    batteryDischargeOrigin: origin,
                },
            },
            today,
            totals,
            savings: tentSavings({
                tentFromSolarKwh: totals.tentFromSolarKwh,
                tentFromGridKwh: totals.tentFromGridKwh,
                solarKwhValueEur: valueEur,
                gridTariffEurPerKwh: gridTariff ?? 0.32,
            }),
            buckets: range === "live" || !sampleWindow.ok
                ? []
                : bucketsFromSeries(series, sampleWindow.startMs, sampleWindow.endMs, range, SAMPLE_TIMEZONE, mode, origin),
            growDisabledHint: null,
        };
    }

    const liveMetrics = input.liveMetrics;
    const allocation = allocateSolarInstant({
        pvW: liveMetrics["pv.power"] ?? null,
        batteryW: liveMetrics["battery.power"] ?? null,
        gridW: liveMetrics["grid.power"] ?? null,
        houseW: liveMetrics["house.power"] ?? null,
        tentW: liveMetrics["tent.power"] ?? null,
        batterySolarMix: 1,
    }, mode, origin);
    const fromState = input.liveState && typeof input.liveState.allocation === "object"
        ? input.liveState.allocation as SolarInstantSplit
        : allocation;

    const growDisabledHint = range === "grow" && !window.ok
        ? "This Grow is available when the current grow has a start date."
        : null;

    const todayWindow = rangeWindowMs("24h", input.nowMs, grow, timezone);
    const today = todayWindow.ok
        ? totalsFromSeries(input.series, todayWindow.startMs, todayWindow.endMs, mode, origin)
        : emptyTotals();
    const totals = range === "live"
        ? today
        : window.ok
            ? totalsFromSeries(input.series, window.startMs, window.endMs, mode, origin)
            : emptyTotals();

    return {
        range,
        sample: false,
        timezone,
        updatedAt: input.observedAt,
        stale: input.stale,
        grow,
        public: publicFlags,
        live: {
            pvW: liveMetrics["pv.power"] ?? null,
            batteryW: liveMetrics["battery.power"] ?? null,
            batterySoc: liveMetrics["battery.soc"] ?? null,
            gridW: liveMetrics["grid.power"] ?? null,
            houseW: liveMetrics["house.power"] ?? null,
            tentW: liveMetrics["tent.power"] ?? null,
            gridMode: liveMetrics["grid.mode"] ?? null,
            allocation: fromState,
            tentDevices: tentDevicesFromState(input.liveState),
            system: {
                name: "Home energy system",
                pvPeakW: asNumber(input.config.pvPeakW),
                batteryWh: asNumber(input.config.batteryWh),
                allocationMode: mode,
                batteryDischargeOrigin: origin,
            },
        },
        today,
        totals,
        savings: tentSavings({
            tentFromSolarKwh: totals.tentFromSolarKwh,
            tentFromGridKwh: totals.tentFromGridKwh,
            solarKwhValueEur: valueEur,
            gridTariffEurPerKwh: gridTariff,
        }),
        buckets: range === "live" || !window.ok
            ? []
            : bucketsFromSeries(input.series, window.startMs, window.endMs, range, timezone, mode, origin),
        growDisabledHint,
    };
}

export function growCycleFromCurrent(seededAt: string, usable: boolean): GrowCycleWindow {
    return usable
        ? {active: true, startedAt: seededAt, endedAt: null}
        : {active: false, startedAt: null, endedAt: null};
}

export {daysInMsRange, parseSolarRange};
