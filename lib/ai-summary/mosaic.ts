import {CLIMATE_METRIC_KEYS, CLIMATE_SLOT_MS, type ClimateMetricKey, type ClimatePoint} from "@/lib/climate/types";
import {
    AI_SUMMARY_MOSAIC_SLOTS,
    type AiMetricJudgment,
    type AiSummaryPayload,
    type MetricVerdict,
    type MosaicCell,
} from "@/lib/ai-summary/types";

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
    const close = distance <= width * 0.25;
    if (value < min) {
        return close ? 4 : 6;
    }
    return close ? 5 : 7;
}

const FOLD_WIDTH = 6;

function mosaicRank(cell: MosaicCell): number {
    if (cell === 3 || cell === 6 || cell === 7) {
        return 3;
    }
    if (cell === 2 || cell === 4 || cell === 5) {
        return 2;
    }
    if (cell === 1) {
        return 1;
    }
    return 0;
}

function mosaicOutranks(next: MosaicCell, best: MosaicCell): boolean {
    const nextRank = mosaicRank(next);
    const bestRank = mosaicRank(best);
    if (nextRank > bestRank) {
        return true;
    }
    if (nextRank === bestRank && nextRank > 0) {
        return next >= 4 || best < 4;
    }
    return false;
}

/** Six stored 5-minute digits become one 30-minute cell. */
export function foldMosaicRow(cells: MosaicCell[]): MosaicCell[] {
    const slots = Math.ceil(AI_SUMMARY_MOSAIC_SLOTS / FOLD_WIDTH);
    const folded: MosaicCell[] = [];
    for (let slot = 0; slot < slots; slot += 1) {
        let best: MosaicCell = 0;
        for (let offset = 0; offset < FOLD_WIDTH; offset += 1) {
            const value = cells[slot * FOLD_WIDTH + offset] ?? 0;
            if (mosaicOutranks(value, best)) {
                best = value;
            }
        }
        folded.push(best);
    }
    return folded;
}

export function mosaicDetail(cell: MosaicCell): {word: "OK" | "ABOVE" | "BELOW"; tone: "ok" | "near" | "far"} | null {
    switch (cell) {
        case 1:
            return {word: "OK", tone: "ok"};
        case 4:
            return {word: "BELOW", tone: "near"};
        case 5:
            return {word: "ABOVE", tone: "near"};
        case 6:
            return {word: "BELOW", tone: "far"};
        case 7:
            return {word: "ABOVE", tone: "far"};
        default:
            return null;
    }
}

export function encodeMosaicRow(cells: MosaicCell[]): string {
    return cells.map((cell) => String(cell)).join("");
}

export function parseMosaicRow(row: string): MosaicCell[] {
    const cells: MosaicCell[] = [];
    for (let i = 0; i < AI_SUMMARY_MOSAIC_SLOTS; i += 1) {
        const char = row[i];
        if (char === "1" || char === "2" || char === "3" || char === "4" || char === "5" || char === "6" || char === "7") {
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
            rows[key][index] = scoreSample(key, point, range);
        }
    }

    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [key, encodeMosaicRow(rows[key])]),
    ) as Record<ClimateMetricKey, string>;
}

/** Lights-off PPFD is not a miss. Every other sample is scored against the one band. */
export function scoreSample(
    key: ClimateMetricKey,
    point: ClimatePoint,
    range: {min: number; max: number},
): MosaicCell {
    if (key === "ppfd" && point.isDay === false) {
        return 0;
    }
    return cellForValue(point[key], range.min, range.max);
}

const IN_RANGE_SHARE = 80;
const CLOSE_SHARE = 60;

function verdictForShare(share: number | null): MetricVerdict {
    if (share === null) {
        return "unknown";
    }
    if (share >= IN_RANGE_SHARE) {
        return "in_range";
    }
    if (share >= CLOSE_SHARE) {
        return "slightly_off";
    }
    return "off";
}

function shareFromRow(row: string): number | null {
    let scored = 0;
    let inside = 0;
    for (const cell of parseMosaicRow(row)) {
        if (cell === 0) {
            continue;
        }
        scored += 1;
        if (cell === 1) {
            inside += 1;
        }
    }
    if (scored === 0) {
        return null;
    }
    return Math.round((inside / scored) * 100);
}

/** Percent and verdict follow the stored samples. The model's note stays. */
export function verdictsFromMosaic(
    mosaic: Record<ClimateMetricKey, string>,
    current: Record<ClimateMetricKey, AiMetricJudgment>,
): Record<ClimateMetricKey, AiMetricJudgment> {
    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => {
            const pctInRange = shareFromRow(mosaic[key] ?? "");
            return [
                key,
                {
                    verdict: verdictForShare(pctInRange),
                    pctInRange,
                    note: current[key]?.note ?? "",
                },
            ];
        }),
    ) as Record<ClimateMetricKey, AiMetricJudgment>;
}

export function emptyMosaic(): Record<ClimateMetricKey, string> {
    const blank = "0".repeat(AI_SUMMARY_MOSAIC_SLOTS);
    return Object.fromEntries(CLIMATE_METRIC_KEYS.map((key) => [key, blank])) as Record<
        ClimateMetricKey,
        string
    >;
}
