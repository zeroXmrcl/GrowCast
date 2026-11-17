import {loadPluginSnapshotStill} from "@/lib/plugins/hooks";

export const MAX_VISION_BYTES = 400_000;

export type SummaryStill = {
    mime: "image/jpeg";
    dataUrl: string;
};

export async function loadNewestSnapshotStill(): Promise<SummaryStill | null> {
    return loadPluginSnapshotStill();
}
