export type ClimatePoint = {
    t: string;
    tempC: number;
    humidityPct: number;
    vpd: number;
};

export type ClimateDayFile = {
    date: string;
    points: ClimatePoint[];
};

export type ClimateMetricStats = {
    last: number;
    min: number;
    max: number;
    avg: number;
};

export type ClimateWindow = {
    axis: [string, string, string];
    stats: {
        tempC: ClimateMetricStats;
        humidityPct: ClimateMetricStats;
        vpd: ClimateMetricStats;
    } | null;
    runs: ClimatePoint[][];
};

export type ClimateHistoryPublic = {
    "24h": ClimateWindow;
    "7d": ClimateWindow;
    "30d": ClimateWindow;
    grow: ClimateWindow | null;
};
