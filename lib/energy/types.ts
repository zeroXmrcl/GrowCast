import type {GgsActuatorKind, GgsDeviceSnapshot} from "@/lib/ggs-live";

export type EnergyLevelSeconds = Record<string, number>;

export type EnergyActuatorHours = Record<string, EnergyLevelSeconds>;

export type EnergyDayHours = Record<string, EnergyActuatorHours>;

export type EnergyDayFile = {
    date: string;
    hours: EnergyDayHours;
    alerts?: EnergyDayHours;
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
    days: Record<string, {hours: EnergyDayHours; alerts?: EnergyDayHours}>;
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

export type EnergySeriesPoint = {
    t: string;
    watts: number;
    held?: boolean;
};

export type EnergySeries = {
    kind: "hour" | "slot6h" | "day";
    points: EnergySeriesPoint[];
};

export type EnergySeriesWindows = {
    today: EnergySeries;
    "7d": EnergySeries;
    "30d": EnergySeries;
    grow: EnergySeries;
};

export type EnergyFlowMark = "EMPTY" | "FULL" | "HOT" | "OFFLINE" | "ALARM";

export type EnergyFlowCell = {
    duty: number;
    alert: number;
    mark: EnergyFlowMark | null;
};

export type EnergyFlowRow = {
    id: string;
    label: string;
    name: string;
    kind: GgsActuatorKind;
    cells: EnergyFlowCell[];
};

export type EnergyFlowView = {
    columns: {t: string; hour: number}[];
    rows: EnergyFlowRow[];
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
    series?: EnergySeriesWindows;
    flow?: EnergyFlowView;
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
