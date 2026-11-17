export type SolarRangeId = "live" | "24h" | "7d" | "30d" | "grow";

export type TentDeviceLoad = {
    name: string;
    label: string;
    kind: string;
    watts: number | null;
};

export type SolarInstantSplit = {
    tentFromSolarW: number | null;
    tentFromPvW: number | null;
    tentFromBatteryW: number | null;
    tentFromGridW: number | null;
    houseOtherFromSolarW: number | null;
    houseOtherFromGridW: number | null;
    houseOtherW: number | null;
    exportW: number | null;
    solarShareOfTent: number | null;
    solarShareOfHouse: number | null;
    tentShareOfHouse: number | null;
    missing: string[];
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

export type TentSavings = {
    tentFromSolarKwh: number | null;
    tentFromGridKwh: number | null;
    tentKwh: number | null;
    tentSolarEur: number | null;
    tentGridEur: number | null;
    tentTotalEur: number | null;
    gridOnlyEur: number | null;
    savingsEur: number | null;
    solarKwhValueEur: number | null;
    gridTariffEurPerKwh: number | null;
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
    grow: {active: boolean; startedAt: string | null; endedAt: string | null};
    public: {pv: boolean; battery: boolean; grid: boolean; tentShare: boolean};
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
            allocationMode: string;
            batteryDischargeOrigin: string;
        };
    };
    today: SolarTotals;
    totals: SolarTotals;
    savings: TentSavings;
    buckets: SolarBucket[];
    growDisabledHint: string | null;
};
