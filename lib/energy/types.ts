import type {GgsActuatorKind, GgsDeviceSnapshot} from "@/lib/ggs-live";

export type EnergyLevelSeconds = Record<string, number>;

export type EnergyActuatorHours = Record<string, EnergyLevelSeconds>;

export type EnergyDayHours = Record<string, EnergyActuatorHours>;

export type EnergyDayFile = {
    date: string;
    hours: EnergyDayHours;
};

export type EnergyCursor = {
    growId: string;
    startedAt: string;
    lastAccruedAt: string;
    devices: GgsDeviceSnapshot[];
};

export type EnergyArchiveFile = {
    version: 1;
    growId: string;
    startedAt: string;
    endedAt: string;
    days: Record<string, {hours: EnergyDayHours}>;
    devices?: GgsDeviceSnapshot[];
};

export type EnergyWindow = {
    kWh: number;
    costEur: number | null;
};

export type EnergyDeviceRow = {
    name: string;
    label: string;
    hoursOn: number;
    kWh: number;
    costEur: number | null;
    sharePct: number;
};

export type EnergyPublicDto = {
    grow: string;
    estimated: true;
    tariffKind: "public" | "private";
    appliedTariffEurPerKwh: number | null;
    startedAt: string | null;
    empty: boolean;
    nowWatts: number | null;
    nowWattsStale: boolean | null;
    windows: {
        today: EnergyWindow;
        "7d": EnergyWindow;
        "30d": EnergyWindow;
        grow: EnergyWindow;
    } | null;
    kWh: number;
    costEur: number | null;
    devices: EnergyDeviceRow[];
};

export type EnergyActuatorRef = {
    key: string;
    serial: string;
    name: string;
    id: string;
    label: string;
    kind: GgsActuatorKind;
};
