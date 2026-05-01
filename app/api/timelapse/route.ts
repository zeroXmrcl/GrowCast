import { promises as fs } from "fs";
import path from "path";

const TIMELAPSE_FILE = path.resolve(
    process.cwd(),
    "extensions",
    "GrowCast-Timelapse",
    "timelapse",
    "latest_timelapse.mp4"
);

export async function GET() {
    try {
        const fileBuffer = await fs.readFile(TIMELAPSE_FILE);

        return new Response(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": "video/mp4",
                "Cache-Control": "no-store, must-revalidate",
            },
        });
    } catch {
        return new Response("Timelapse not found", { status: 404 });
    }
}
