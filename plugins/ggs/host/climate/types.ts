export const CLIMATE_SLOT_MS = 5 * 60 * 1000;
export const CLIMATE_RETENTION_DAYS = 180;
export const CLIMATE_ARCHIVE_VERSION = 1;

export const CLIMATE_METRIC_KEYS = ["tempC", "humidityPct", "vpd", "co2", "ppfd"] as const;
export type ClimateMetricKey = (typeof CLIMATE_METRIC_KEYS)[number];

export type ClimatePoint = {
    t: string;
    tempC: number | null;
    humidityPct: number | null;
    vpd: number | null;
    co2: number | null;
    ppfd: number | null;
    isDay: boolean | null;
    alarm?: boolean;
};

export type ClimateDayFile = {
    date: string;
    points: ClimatePoint[];
};

export type ClimateArchiveFile = {
    version: typeof CLIMATE_ARCHIVE_VERSION;
    growId: string;
    startedAt: string;
    endedAt: string;
    days: Record<string, ClimateDayFile>;
};
