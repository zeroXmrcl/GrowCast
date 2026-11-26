export type AllocationMode = "proportional" | "tent-first" | "tent-last";

export type BatteryDischargeOrigin = "always-solar" | "always-grid" | "mix";

export type SolarInstantInput = {
    pvW: number | null;
    batteryW: number | null;
    gridW: number | null;
    houseW: number | null;
    tentW: number | null;
    batterySolarMix: number | null;
};

export type SolarInstantSplit = {
    solarSupplyW: number | null;
    gridSupplyW: number | null;
    tentFromSolarW: number | null;
    tentFromPvW: number | null;
    tentFromBatteryW: number | null;
    tentFromGridW: number | null;
    houseOtherFromSolarW: number | null;
    houseOtherFromGridW: number | null;
    exportW: number | null;
    houseOtherW: number | null;
    tentShareOfHouse: number | null;
    solarShareOfTent: number | null;
    solarShareOfHouse: number | null;
    missing: string[];
};

export type SolarCostInput = {
    tentFromSolarKwh: number | null;
    tentFromGridKwh: number | null;
    solarKwhValueEur: number | null;
    gridTariffEurPerKwh: number | null;
};

export type SolarCost = {
    tentSolarEur: number | null;
    tentGridEur: number | null;
    tentTotalEur: number | null;
};

function finite(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function roundEur(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function missingPush(missing: string[], key: string, value: number | null): void {
    if (!finite(value)) {
        missing.push(key);
    }
}

function clampMix(value: number | null): number {
    if (!finite(value)) {
        return 1;
    }
    return Math.min(1, Math.max(0, value));
}

export function batterySolarWatts(
    batteryW: number | null,
    origin: BatteryDischargeOrigin,
    mix: number | null,
): {solarW: number | null; gridW: number | null} {
    if (!finite(batteryW)) {
        return {solarW: null, gridW: null};
    }
    const discharge = Math.max(0, batteryW);
    const charge = Math.max(0, -batteryW);
    if (charge > 0) {
        return {solarW: 0, gridW: 0};
    }
    if (origin === "always-grid") {
        return {solarW: 0, gridW: discharge};
    }
    if (origin === "mix") {
        const solarMix = clampMix(mix);
        return {solarW: discharge * solarMix, gridW: discharge * (1 - solarMix)};
    }
    return {solarW: discharge, gridW: 0};
}

export function allocateSolarInstant(
    input: SolarInstantInput,
    mode: AllocationMode = "proportional",
    origin: BatteryDischargeOrigin = "always-solar",
): SolarInstantSplit {
    const missing: string[] = [];
    missingPush(missing, "pvW", input.pvW);
    missingPush(missing, "houseW", input.houseW);
    const batt = batterySolarWatts(input.batteryW, origin, input.batterySolarMix);
    if (!finite(input.batteryW)) {
        missing.push("batteryW");
    }

    const solarSupplyW = finite(input.pvW) && finite(batt.solarW) ? input.pvW + batt.solarW : null;
    const gridImportW = finite(input.gridW) ? Math.max(0, input.gridW) : null;
    const exportFromGridW = finite(input.gridW) ? Math.max(0, -input.gridW) : null;
    if (!finite(input.gridW)) {
        missing.push("gridW");
    }

    const tentW = finite(input.tentW) && finite(input.houseW)
        ? Math.min(Math.max(0, input.tentW), input.houseW)
        : finite(input.tentW) ? Math.max(0, input.tentW) : null;
    if (!finite(input.tentW)) {
        missing.push("tentW");
    }
    const houseOtherW = finite(input.houseW) && finite(tentW) ? Math.max(0, input.houseW - tentW) : null;

    const empty: SolarInstantSplit = {
        solarSupplyW,
        gridSupplyW: gridImportW,
        tentFromSolarW: null,
        tentFromPvW: null,
        tentFromBatteryW: null,
        tentFromGridW: null,
        houseOtherFromSolarW: null,
        houseOtherFromGridW: null,
        exportW: exportFromGridW,
        houseOtherW,
        tentShareOfHouse: finite(input.houseW) && input.houseW > 0 && finite(tentW) ? tentW / input.houseW : null,
        solarShareOfTent: null,
        solarShareOfHouse: null,
        missing,
    };

    if (!finite(solarSupplyW) || !finite(input.houseW) || !finite(tentW) || !finite(houseOtherW)) {
        return empty;
    }

    const coveredBySolar = Math.min(solarSupplyW, input.houseW);
    const exportW = Math.max(0, solarSupplyW - input.houseW);
    let tentFromSolarW: number;
    let houseOtherFromSolarW: number;
    if (solarSupplyW >= input.houseW) {
        tentFromSolarW = tentW;
        houseOtherFromSolarW = houseOtherW;
    } else if (mode === "tent-first") {
        tentFromSolarW = Math.min(tentW, coveredBySolar);
        houseOtherFromSolarW = Math.min(houseOtherW, coveredBySolar - tentFromSolarW);
    } else if (mode === "tent-last") {
        houseOtherFromSolarW = Math.min(houseOtherW, coveredBySolar);
        tentFromSolarW = Math.min(tentW, coveredBySolar - houseOtherFromSolarW);
    } else {
        const tentShare = input.houseW > 0 ? tentW / input.houseW : 0;
        tentFromSolarW = coveredBySolar * tentShare;
        houseOtherFromSolarW = coveredBySolar * (1 - tentShare);
    }

    const tentFromGridW = tentW - tentFromSolarW;
    const houseOtherFromGridW = houseOtherW - houseOtherFromSolarW;
    const {tentFromPvW, tentFromBatteryW} = splitTentSolar(
        tentFromSolarW,
        solarSupplyW,
        input.pvW,
        batt.solarW,
    );

    return {
        solarSupplyW,
        gridSupplyW: gridImportW,
        tentFromSolarW,
        tentFromPvW,
        tentFromBatteryW,
        tentFromGridW,
        houseOtherFromSolarW,
        houseOtherFromGridW,
        exportW: finite(exportFromGridW) ? Math.max(exportW, exportFromGridW) : exportW,
        houseOtherW,
        tentShareOfHouse: input.houseW > 0 ? tentW / input.houseW : null,
        solarShareOfTent: tentW > 0 ? tentFromSolarW / tentW : null,
        solarShareOfHouse: input.houseW > 0 ? coveredBySolar / input.houseW : null,
        missing,
    };
}

function splitTentSolar(
    tentFromSolarW: number,
    solarSupplyW: number,
    pvW: number | null,
    batterySolarW: number | null,
): {tentFromPvW: number | null; tentFromBatteryW: number | null} {
    if (!finite(pvW) || !finite(batterySolarW)) {
        return {tentFromPvW: null, tentFromBatteryW: null};
    }
    if (solarSupplyW <= 0) {
        return {tentFromPvW: 0, tentFromBatteryW: 0};
    }
    return {
        tentFromPvW: tentFromSolarW * (Math.max(0, pvW) / solarSupplyW),
        tentFromBatteryW: tentFromSolarW * (batterySolarW / solarSupplyW),
    };
}

export function valueSolarCost(input: SolarCostInput): SolarCost {
    const tentSolarEur = finite(input.tentFromSolarKwh) && finite(input.solarKwhValueEur)
        ? roundEur(input.tentFromSolarKwh * input.solarKwhValueEur)
        : null;
    const tentGridEur = finite(input.tentFromGridKwh) && finite(input.gridTariffEurPerKwh)
        ? roundEur(input.tentFromGridKwh * input.gridTariffEurPerKwh)
        : null;
    const tentTotalEur = finite(tentSolarEur) && finite(tentGridEur) ? roundEur(tentSolarEur + tentGridEur) : null;
    return {tentSolarEur, tentGridEur, tentTotalEur};
}

export function nextBatteryMix(
    previousMix: number | null,
    batteryW: number | null,
    pvW: number | null,
    houseW: number | null,
    capacityWh: number,
    intervalS: number,
): number | null {
    if (!finite(batteryW) || capacityWh <= 0 || intervalS <= 0) {
        return previousMix;
    }
    const hours = intervalS / 3600;
    const chargeWh = Math.max(0, -batteryW) * hours;
    const dischargeWh = Math.max(0, batteryW) * hours;
    const mix = clampMix(previousMix);
    if (chargeWh <= 0 && dischargeWh <= 0) {
        return previousMix;
    }
    const storedWh = capacityWh;
    if (chargeWh > 0) {
        const solarHeadroom = finite(pvW) && finite(houseW) ? Math.max(0, pvW - houseW) : null;
        if (!finite(solarHeadroom)) {
            return previousMix;
        }
        const solarCharge = Math.min(chargeWh, solarHeadroom * hours);
        const solarFractionOfCharge = chargeWh > 0 ? solarCharge / chargeWh : 0;
        const newMix = (mix * storedWh + solarFractionOfCharge * chargeWh) / (storedWh + chargeWh);
        return clampMix(newMix);
    }
    return mix;
}
