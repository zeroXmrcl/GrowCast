import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { SNAPSHOT_DIR } from "@/lib/extension-status";

function getContentType(filename: string): string {
    const lower = filename.toLowerCase();

    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";

    return "application/octet-stream";
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await context.params;

        if (
            filename.includes("/") ||
            filename.includes("\\") ||
            filename.includes("..")
        ) {
            return new Response("Invalid filename", { status: 400 });
        }

        const filePath = path.join(SNAPSHOT_DIR, filename);
        const fileBuffer = await fs.readFile(filePath);

        return new Response(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": getContentType(filename),
                "Cache-Control": "no-store, must-revalidate",
            },
        });
    } catch {
        return new Response("File not found", { status: 404 });
    }
}
