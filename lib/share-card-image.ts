import {readFile} from "node:fs/promises";
import path from "node:path";
import {sanitizeError, getLogger} from "@/lib/logging";
import {
    shareCardStillPath,
    stillImageMime,
    type ShareCardStill,
} from "@/lib/share-card";
import {convertWebpBufferToJpeg} from "@/lib/webp-still";

function asDataUrl(mime: string, buffer: Buffer): string {
    return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function stillSrcFromFile(still: ShareCardStill): Promise<string | null> {
    const filePath = shareCardStillPath(still);
    const mime = stillImageMime(still.name);
    if (!mime) {
        return null;
    }
    if (mime === "image/jpeg" || mime === "image/png") {
        const bytes = await readFile(filePath);
        return asDataUrl(mime, bytes);
    }
    const webp = await readFile(filePath);
    const jpeg = await convertWebpBufferToJpeg(webp);
    return asDataUrl("image/jpeg", jpeg);
}

export async function rasterizeShareCardAssets(still: ShareCardStill | null): Promise<{
    stillSrc: string | null;
    logoSrc: string;
}> {
    const logoSvg = await readFile(path.join(process.cwd(), "public", "growCastLogo_green.svg"));
    const logoSrc = asDataUrl("image/svg+xml", logoSvg);

    let stillSrc: string | null = null;
    if (still) {
        try {
            stillSrc = await stillSrcFromFile(still);
        } catch (error) {
            getLogger().warn(
                {
                    event: "og.still.convert_failed",
                    still_kind: still.kind,
                    still_name: still.name,
                    err: sanitizeError(error),
                },
                "share card still conversion failed",
            );
            stillSrc = null;
        }
    }

    return {stillSrc, logoSrc};
}
