import {asString, isRecord} from "@/lib/coerce";
import {parseOverlayLayout, type OverlayLayout} from "@/lib/overlay-layout";
import {parseOverlayStream, type OverlayStream} from "@/lib/overlay-stream";
import {parseOverlayScalePct} from "@/lib/overlay-scale";

export const OVERLAY_GROW_POLL_MS = 5_000;
export const OVERLAY_GROW_PATH = "/api/data/current-grow";

export type OverlayGrowView = {
    plant: string;
    name: string;
    seededAt: string;
    overlayLayout: OverlayLayout;
    overlayStream: OverlayStream;
    overlayScalePct: number;
    streamUrl: string;
    stage: string;
    lightSchedule: string;
    strain: string;
};

export function mergeOverlayGrowPoll(
    current: OverlayGrowView,
    incoming: OverlayGrowView,
    lockStream: boolean,
): OverlayGrowView {
    if (!lockStream) {
        return incoming;
    }
    return {
        ...incoming,
        overlayStream: current.overlayStream,
        streamUrl: current.streamUrl,
    };
}

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
        overlayStream: parseOverlayStream(raw.overlayStream),
        overlayScalePct: parseOverlayScalePct(raw.overlayScalePct),
        streamUrl: asString(raw.streamUrl),
        stage: asString(details.stage),
        lightSchedule: asString(details.lightSchedule),
        strain: asString(details.strain),
    };
}
