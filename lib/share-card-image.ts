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
    const sharp = (await import("sharp")).default;
    const logoSvg = await readFile(path.join(process.cwd(), "public", "growCastLogo_green.svg"));
    const logoPng = await sharp(logoSvg).resize(80, 80).png().toBuffer();
    const logoSrc = asPngDataUrl(logoPng);

    if (!still) {
        return {stillSrc: null, logoSrc};
    }

    try {
        const stillPng = await sharp(shareCardStillPath(still), {limitInputPixels: 80_000_000})
            .rotate()
            .resize(1200, 630, {fit: "cover"})
            .png()
            .toBuffer();
        return {stillSrc: asPngDataUrl(stillPng), logoSrc};
    } catch {
        return {stillSrc: null, logoSrc};
    }
}
