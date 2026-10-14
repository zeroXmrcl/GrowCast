import {readFile} from "node:fs/promises";
import path from "node:path";
import {getSnapshotFiles, SNAPSHOT_DIR} from "@/lib/extension-status";
import {IMAGE_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";
import {encodePortableSnapshotThumb} from "@/lib/snapshot-thumb";
import {logAiSummary} from "@/lib/ai-summary/log";

const MAX_VISION_BYTES = 1_500_000;

export type SummaryStill = {
    mime: "image/jpeg";
    dataUrl: string;
};

export async function loadNewestSnapshotStill(): Promise<SummaryStill | null> {
    const files = await getSnapshotFiles();
    const newest = files[0];
    if (!newest || !isSafeMediaFilename(newest, IMAGE_EXTENSIONS)) {
        return null;
    }
    const filePath = path.join(SNAPSHOT_DIR, newest);
    try {
        const input = await readFile(filePath);
        const jpeg = await encodePortableSnapshotThumb(input);
        if (jpeg.length === 0 || jpeg.length > MAX_VISION_BYTES) {
            return null;
        }
        return {
            mime: "image/jpeg",
            dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        };
    } catch {
        logAiSummary("snapshot_still_failed");
        return null;
    }
}
