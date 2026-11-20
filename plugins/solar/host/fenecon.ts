export const FEMS_CHANNELS = {
    "pv.power": "_sum/ProductionActivePower",
    "battery.soc": "_sum/EssSoc",
    "battery.power": "_sum/EssDischargePower",
    "grid.power": "_sum/GridActivePower",
    "house.power": "_sum/ConsumptionActivePower",
    "grid.mode": "_sum/GridMode",
    "pv.energy": "_sum/ProductionActiveEnergy",
    "grid.import": "_sum/GridBuyActiveEnergy",
    "grid.export": "_sum/GridSellActiveEnergy",
    "house.energy": "_sum/ConsumptionActiveEnergy",
    "battery.charge": "_sum/EssDcChargeEnergy",
    "battery.discharge": "_sum/EssDcDischargeEnergy",
} as const;

export type SolarAdapter = {
    id: string;
    read(): Promise<Record<string, number>>;
};

export type RestClient = {
    getJson(url: string, init: {username: string; password: string; timeoutMs: number}): Promise<unknown>;
};

export type FeneconRestConfig = {
    host: string;
    password: string;
    timeoutMs?: number;
};

function asFinite(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return null;
}

export async function readFeneconRest(
    config: FeneconRestConfig,
    client: RestClient,
): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {};
    const timeoutMs = config.timeoutMs ?? 5000;
    for (const [key, channel] of Object.entries(FEMS_CHANNELS)) {
        try {
            const url = `http://${config.host}/rest/channel/${channel}`;
            const raw = await client.getJson(url, {username: "x", password: config.password, timeoutMs});
            const value = raw && typeof raw === "object" && "value" in raw
                ? asFinite((raw as {value: unknown}).value)
                : null;
            if (value !== null) {
                metrics[key] = value;
            }
        } catch {
            /* missing stays missing */
        }
    }
    return metrics;
}

export const MODBUS_REGISTERS: Record<keyof typeof FEMS_CHANNELS, {address: number; type: "float32" | "float64" | "uint16" | "enum16"}> = {
    "pv.power": {address: 327, type: "float32"},
    "battery.soc": {address: 302, type: "uint16"},
    "battery.power": {address: 415, type: "float32"},
    "grid.power": {address: 315, type: "float32"},
    "house.power": {address: 343, type: "float32"},
    "grid.mode": {address: 417, type: "enum16"},
    "pv.energy": {address: 367, type: "float64"},
    "grid.import": {address: 359, type: "float64"},
    "grid.export": {address: 363, type: "float64"},
    "house.energy": {address: 379, type: "float64"},
    "battery.charge": {address: 383, type: "float64"},
    "battery.discharge": {address: 387, type: "float64"},
};

export async function readFeneconModbus(
    registers: Partial<Record<keyof typeof FEMS_CHANNELS, number | null>>,
): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {};
    for (const key of Object.keys(FEMS_CHANNELS) as Array<keyof typeof FEMS_CHANNELS>) {
        const value = registers[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            metrics[key] = value;
        }
    }
    return metrics;
}
