import {asString, isRecord} from "@/lib/coerce";
import {parseOverlayLayout, type OverlayLayout} from "@/lib/overlay-layout";

export const OVERLAY_GROW_POLL_MS = 5_000;
export const OVERLAY_GROW_PATH = "/api/data/current-grow";

export type OverlayGrowView = {
    plant: string;
    name: string;
    seededAt: string;
    overlayLayout: OverlayLayout;
};

export function parseOverlayGrowBody(raw: unknown): OverlayGrowView | null {
    if (!isRecord(raw)) {
        return null;
    }
    const details = isRecord(raw.details) ? raw.details : {};
    return {
        plant: asString(raw.plant),
        name: asString(raw.name),
        seededAt: asString(details.seededAt),
        overlayLayout: parseOverlayLayout(raw.overlayLayout),
    };
}
