import { NextRequest } from "next/server";
import { SNAPSHOT_DIR } from "@/lib/extension-status";
import {
    logHttpPathTraversalBlocked,
    withRequestLog,
} from "@/lib/logging";
import { openMediaFile } from "@/lib/open-media-file";
import { IMAGE_EXTENSIONS } from "@/lib/safe-media-filename";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ filename: string }> }
) {
    return withRequestLog(request, "/api/snapshots/:filename", async () => {
        const { filename } = await context.params;
        const opened = await openMediaFile(SNAPSHOT_DIR, filename, IMAGE_EXTENSIONS);
        if (!opened.ok) {
            if (opened.status === 400) {
                logHttpPathTraversalBlocked({ reason: "invalid_filename" });
                return new Response("Invalid filename", { status: 400 });
            }
            return new Response("File not found", { status: 404 });
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
