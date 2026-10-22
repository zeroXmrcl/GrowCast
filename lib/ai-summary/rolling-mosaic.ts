import {
    buildMosaic,
    cellForValue,
    encodeMosaicRow,
    mosaicSlotIndex,
    parseMosaicRow,
} from "@/lib/ai-summary/mosaic";
import type {AiSummaryPayload, MosaicCell} from "@/lib/ai-summary/types";
import {AI_SUMMARY_MOSAIC_SLOTS} from "@/lib/ai-summary/types";
import {CLIMATE_METRIC_KEYS, CLIMATE_SLOT_MS, type ClimateMetricKey, type ClimatePoint} from "@/lib/climate/types";

export const AI_SUMMARY_WINDOW_MS = AI_SUMMARY_MOSAIC_SLOTS * CLIMATE_SLOT_MS;
export const AI_SUMMARY_MOSAIC_POLL_MS = 60_000;
export const AI_SUMMARY_MOSAIC_URL = "/api/data/ai-summary";

const FOLD_WIDTH = 6;

export function mosaicCurrentSlotMs(nowMs: number): number {
    return Math.floor(nowMs / CLIMATE_SLOT_MS) * CLIMATE_SLOT_MS;
}

/** Rolling 24h window whose last 5-minute slot is the slot that contains `now`. */
export function mosaicWindowStartMs(nowMs: number): number {
    return mosaicCurrentSlotMs(nowMs) - (AI_SUMMARY_MOSAIC_SLOTS - 1) * CLIMATE_SLOT_MS;
}

export function mosaicWindowEndMs(windowStartMs: number): number {
    return windowStartMs + AI_SUMMARY_WINDOW_MS;
}

export function currentMosaicSlotIndex(nowMs: number, windowStartMs: number): number {
    const endMs = mosaicWindowEndMs(windowStartMs);
    const t = Math.min(Math.max(nowMs, windowStartMs), endMs - 1);
    return mosaicSlotIndex(t, windowStartMs) ?? AI_SUMMARY_MOSAIC_SLOTS - 1;
}

/** Hover time for a folded 30-minute cell: last 5-minute slot in that group. */
export function mosaicFoldSlotMs(windowStartMs: number, foldIndex: number): number {
    return windowStartMs + (foldIndex * FOLD_WIDTH + (FOLD_WIDTH - 1)) * CLIMATE_SLOT_MS;
}

export function mosaicSlotShift(fromWindowStartMs: number, toWindowStartMs: number): number {
    return Math.trunc((toWindowStartMs - fromWindowStartMs) / CLIMATE_SLOT_MS);
}

export function shiftMosaicRow(row: string, slotShift: number): string {
    const cells = parseMosaicRow(row);
    if (!Number.isFinite(slotShift) || slotShift === 0) {
        return encodeMosaicRow(cells);
    }
    const next = Array<MosaicCell>(AI_SUMMARY_MOSAIC_SLOTS).fill(0);
    for (let i = 0; i < AI_SUMMARY_MOSAIC_SLOTS; i += 1) {
        const from = i + slotShift;
        if (from >= 0 && from < AI_SUMMARY_MOSAIC_SLOTS) {
            next[i] = cells[from] ?? 0;
        }
    }
    return encodeMosaicRow(next);
}

export function shiftMosaic(
    mosaic: Record<ClimateMetricKey, string>,
    fromWindowStartMs: number,
    toWindowStartMs: number,
): Record<ClimateMetricKey, string> {
    const slotShift = mosaicSlotShift(fromWindowStartMs, toWindowStartMs);
    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => [key, shiftMosaicRow(mosaic[key] ?? "", slotShift)]),
    ) as Record<ClimateMetricKey, string>;
}

export function liveMosaicCell(
    key: ClimateMetricKey,
    value: number | null,
    range: {min: number; max: number} | null,
    isDay: boolean | null,
): MosaicCell {
    if (key === "ppfd" && isDay === false) {
        return 0;
    }
    if (!range || value === null || !Number.isFinite(value)) {
        return 0;
    }
    return cellForValue(value, range.min, range.max);
}

export function writeMosaicSlot(row: string, index: number, cell: MosaicCell): string {
    const cells = parseMosaicRow(row);
    if (index < 0 || index >= AI_SUMMARY_MOSAIC_SLOTS) {
        return encodeMosaicRow(cells);
    }
    cells[index] = cell;
    return encodeMosaicRow(cells);
}

export type MosaicLiveOverlay = {
    ranges: AiSummaryPayload["ranges"];
    liveValues: Record<ClimateMetricKey, number | null>;
    liveFresh: boolean;
    isDay: boolean | null;
};

export function overlayLiveMosaic(
    mosaic: Record<ClimateMetricKey, string>,
    windowStartMs: number,
    nowMs: number,
    input: MosaicLiveOverlay,
): Record<ClimateMetricKey, string> {
    if (!input.liveFresh) {
        return mosaic;
    }
    const index = currentMosaicSlotIndex(nowMs, windowStartMs);
    return Object.fromEntries(
        CLIMATE_METRIC_KEYS.map((key) => {
            const value = input.liveValues[key] ?? null;
            const range = input.ranges[key];
            const lightsOffPpfd = key === "ppfd" && input.isDay === false;
            if (!range || value === null || !Number.isFinite(value)) {
                return [key, mosaic[key] ?? ""];
            }
            const cell = lightsOffPpfd ? 0 : liveMosaicCell(key, value, range, input.isDay);
            return [key, writeMosaicSlot(mosaic[key] ?? "", index, cell)];
        }),
    ) as Record<ClimateMetricKey, string>;
}

export function rollMosaicForDisplay(input: {
    mosaic: Record<ClimateMetricKey, string>;
    mosaicWindowStartMs: number;
    nowMs: number;
    ranges: AiSummaryPayload["ranges"];
    liveValues: Record<ClimateMetricKey, number | null>;
    liveFresh: boolean;
    isDay: boolean | null;
    slideHistory?: boolean;
}): {mosaic: Record<ClimateMetricKey, string>; windowStartMs: number} {
    const windowStartMs = mosaicWindowStartMs(input.nowMs);
    const shifted = input.slideHistory === false
        ? input.mosaic
        : shiftMosaic(input.mosaic, input.mosaicWindowStartMs, windowStartMs);
    return {
        mosaic: overlayLiveMosaic(shifted, windowStartMs, input.nowMs, input),
        windowStartMs,
    };
}

export function sameMosaic(
    left: Record<ClimateMetricKey, string>,
    right: Record<ClimateMetricKey, string>,
): boolean {
    return CLIMATE_METRIC_KEYS.every((key) => left[key] === right[key]);
}

export function mosaicFromPublicBody(raw: unknown): Record<ClimateMetricKey, string> | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const body = raw as {available?: unknown; mosaic?: unknown};
    if (body.available === false) {
        return null;
    }
    const mosaic = body.mosaic;
    if (!mosaic || typeof mosaic !== "object") {
        return null;
    }
    const rows = {} as Record<ClimateMetricKey, string>;
    for (const key of CLIMATE_METRIC_KEYS) {
        const row = (mosaic as Record<string, unknown>)[key];
        if (typeof row !== "string") {
            return null;
        }
        rows[key] = encodeMosaicRow(parseMosaicRow(row));
    }
    return rows;
}

export async function fetchPublicMosaic(
    fetchImpl: typeof fetch,
    url: string = AI_SUMMARY_MOSAIC_URL,
    signal?: AbortSignal,
): Promise<Record<ClimateMetricKey, string> | null> {
    try {
        const response = await fetchImpl(url, {
            cache: "no-store",
            headers: {Accept: "application/json"},
            signal,
        });
        if (!response.ok) {
            return null;
        }
        return mosaicFromPublicBody(await response.json());
    } catch {
        return null;
    }
}

export async function rebuildRollingMosaic(
    ranges: AiSummaryPayload["ranges"],
    nowMs: number,
    loadPoints: (startMs: number, endMs: number) => Promise<ClimatePoint[]>,
): Promise<Record<ClimateMetricKey, string>> {
    const windowStartMs = mosaicWindowStartMs(nowMs);
    const points = await loadPoints(windowStartMs, mosaicWindowEndMs(windowStartMs));
    return buildMosaic(points, windowStartMs, ranges);
}
