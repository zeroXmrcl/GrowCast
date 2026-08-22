import path from "path";
import { withRequestLog } from "@/lib/logging";
import { openFixedMediaFile } from "@/lib/open-media-file";
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
        const opened = await openFixedMediaFile(TIMELAPSE_FILE, VIDEO_EXTENSIONS);
        if (!opened.ok) {
            return new Response("Timelapse not found", { status: 404 });
        }

        return new Response(new Uint8Array(opened.buffer), {
            status: 200,
            headers: {
                "Content-Type": opened.contentType,
                "Cache-Control": "no-store, must-revalidate",
            },
        });
    });
}
