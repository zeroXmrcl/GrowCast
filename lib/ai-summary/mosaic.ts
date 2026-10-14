import {CLIMATE_METRIC_KEYS, CLIMATE_SLOT_MS, type ClimateMetricKey, type ClimatePoint} from "@/lib/climate/types";
import {AI_SUMMARY_MOSAIC_SLOTS, type AiSummaryPayload, type MosaicCell} from "@/lib/ai-summary/types";

export function mosaicSlotIndex(tMs: number, windowStartMs: number): number | null {
    const index = Math.floor((tMs - windowStartMs) / CLIMATE_SLOT_MS);
    if (index < 0 || index >= AI_SUMMARY_MOSAIC_SLOTS) {
        return null;
    }
    return index;
}

export function cellForValue(value: number | null, min: number, max: number): MosaicCell {
    if (value === null || !Number.isFinite(value)) {
        return 0;
    }
    if (value >= min && value <= max) {
        return 1;
    }
    const width = Math.max(0.0001, max - min);
    const distance = value < min ? min - value : value - max;
    return distance <= width * 0.25 ? 2 : 3;
}

export function encodeMosaicRow(cells: MosaicCell[]): string {
    return cells.map((cell) => String(cell)).join("");
}

export function parseMosaicRow(row: string): MosaicCell[] {
    const cells: MosaicCell[] = [];
    for (let i = 0; i < AI_SUMMARY_MOSAIC_SLOTS; i += 1) {
        const char = row[i];
        if (char === "1" || char === "2" || char === "3") {
            cells.push(Number(char) as MosaicCell);
        } else {
            cells.push(0);
        }
    }
    return cells;
}

export function buildMosaic(
    points: ClimatePoint[],
    windowStartMs: number,
    ranges: AiSummaryPayload["ranges"],
): Record<ClimateMetricKey, string> {
    const rows = Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [key, Array<MosaicCell>(AI_SUMMARY_MOSAIC_SLOTS).fill(0)]),
    ) as Record<ClimateMetricKey, MosaicCell[]>;

    for (const point of points) {
        const t = Date.parse(point.t);
        const index = mosaicSlotIndex(t, windowStartMs);
        if (index === null) {
            continue;
        }
        for (const key of CLIMATE_METRIC_KEYS) {
            const range = ranges[key];
            if (!range) {
                continue;
            }
            rows[key][index] = cellForValue(point[key], range.min, range.max);
        }
    }

    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [key, encodeMosaicRow(rows[key])]),
    ) as Record<ClimateMetricKey, string>;
}

export function emptyMosaic(): Record<ClimateMetricKey, string> {
    const blank = "0".repeat(AI_SUMMARY_MOSAIC_SLOTS);
    return Object.fromEntries(CLIMATE_METRIC_KEYS.map((key) => [key, blank])) as Record<
        ClimateMetricKey,
        string
    >;
}
