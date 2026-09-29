import path from "path";
import { withRequestLog } from "@/lib/logging";
import { streamFixedMediaFile } from "@/lib/open-media-file";
import { VIDEO_EXTENSIONS } from "@/lib/safe-media-filename";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIMELAPSE_FILE = path.resolve(
    process.cwd(),
    "extensions",
    "GrowCast-Timelapse",
    "timelapse",
    "latest_timelapse.mp4"
);

export async function GET(request: Request) {
    return withRequestLog(request, "/api/timelapse", async () => {
        return streamFixedMediaFile(
            TIMELAPSE_FILE,
            request,
            VIDEO_EXTENSIONS,
            "no-store, must-revalidate",
        );
    });
}
