export const CLIMATE_HISTORY_METRICS = ["tempC", "humidityPct", "vpd"] as const;
export type ClimateHistoryMetric = (typeof CLIMATE_HISTORY_METRICS)[number];

export const CLIMATE_HISTORY_OPEN_LABEL = {
    tempC: "Open temperature history",
    humidityPct: "Open humidity history",
    vpd: "Open VPD history",
} as const satisfies Record<ClimateHistoryMetric, string>;

export function climateHistoryOpenLabel(metric: ClimateHistoryMetric): string {
    return CLIMATE_HISTORY_OPEN_LABEL[metric];
}

export const CLIMATE_HISTORY_METRIC_CHIPS: {key: ClimateHistoryMetric; label: string}[] = [
    {key: "tempC", label: "Temp"},
    {key: "humidityPct", label: "Humidity"},
    {key: "vpd", label: "VPD"},
];
