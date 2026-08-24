import {readFile} from "node:fs/promises";
import path from "node:path";
import {shareCardStillPath, type ShareCardStill} from "@/lib/share-card";

function asPngDataUrl(buffer: Buffer): string {
    return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function rasterizeShareCardAssets(still: ShareCardStill | null): Promise<{
    stillSrc: string | null;
    logoSrc: string;
}> {
    const logoSvg = await readFile(path.join(process.cwd(), "public", "growCastLogo_green.svg"));
    let logoSrc = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;
    let stillSrc: string | null = null;

    try {
        const sharp = (await import("sharp")).default;
        try {
            const logoPng = await sharp(logoSvg).resize(80, 80).png().toBuffer();
            logoSrc = asPngDataUrl(logoPng);
        } catch {
            // Keep the SVG data URL if native sharp/libvips is missing.
        }
        if (still) {
            const stillPng = await sharp(shareCardStillPath(still), {limitInputPixels: 80_000_000})
                .rotate()
                .resize(1200, 630, {fit: "cover"})
                .png()
                .toBuffer();
            stillSrc = asPngDataUrl(stillPng);
        }
    } catch {
        stillSrc = null;
    }

    return {stillSrc, logoSrc};
}
