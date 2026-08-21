import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { archiveMediaDir, isArchiveMediaKind, isValidArchiveId } from "@/lib/archives";
import {
    logHttpPathTraversalBlocked,
    withRequestLog,
} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getContentType(filename: string): string {
    const lower = filename.toLowerCase();

    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".mp4")) return "video/mp4";

    return "application/octet-stream";
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ archiveId: string; kind: string; filename: string }> }
) {
    return withRequestLog(request, "/api/archives/:archiveId/:kind/:filename", async () => {
        try {
            const { archiveId, kind, filename } = await context.params;

            if (!isValidArchiveId(archiveId) || !isArchiveMediaKind(kind)) {
                logHttpPathTraversalBlocked({ reason: "invalid_archive_path" });
                return new Response("Not found", { status: 404 });
            }

            if (
                filename.includes("/") ||
                filename.includes("\\") ||
                filename.includes("..")
            ) {
                logHttpPathTraversalBlocked({ reason: "invalid_filename" });
                return new Response("Invalid filename", { status: 400 });
            }

            const filePath = path.join(archiveMediaDir(archiveId, kind), filename);
            const fileBuffer = await fs.readFile(filePath);

            return new Response(fileBuffer, {
                status: 200,
                headers: {
                    "Content-Type": getContentType(filename),
                    // Archived media never changes, so let clients cache aggressively.
                    "Cache-Control": "public, max-age=31536000, immutable",
                },
            });
        } catch {
            return new Response("File not found", { status: 404 });
        }
    });
}
