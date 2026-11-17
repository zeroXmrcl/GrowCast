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

export const CLIMATE_HISTORY_RANGES = ["24h", "7d", "30d", "grow"] as const;
export type ClimateHistoryRange = (typeof CLIMATE_HISTORY_RANGES)[number];

export function emptyClimateWindow(): ClimateWindow {
    return {axis: ["", "", ""], stats: null, runs: []};
}

export function emptyClimateHistory(): ClimateHistoryPublic {
    return {
        "24h": emptyClimateWindow(),
        "7d": emptyClimateWindow(),
        "30d": emptyClimateWindow(),
        grow: null,
    };
}

export function parseClimateHistoryRange(raw: string | null): ClimateHistoryRange | "all" | null {
    if (raw === null || raw === "" || raw === "all") {
        return "all";
    }
    if (raw.length > 8) {
        return null;
    }
    for (const range of CLIMATE_HISTORY_RANGES) {
        if (raw === range) {
            return range;
        }
    }
    return null;
}
