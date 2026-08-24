import {createRequire} from "node:module";
import jpeg from "jpeg-js";

const require = createRequire(import.meta.url);
const webp = require("webp-wasm") as {
    decode: (buffer: Uint8Array) => Promise<{data: Uint8ClampedArray; width: number; height: number} | null>;
};

export const SHARE_CARD_STILL_WIDTH = 1200;
export const SHARE_CARD_STILL_HEIGHT = 630;
const MAX_INPUT_PIXELS = 80_000_000;
const JPEG_QUALITY = 80;

function coverResizeRgba(
    src: Uint8ClampedArray,
    srcWidth: number,
    srcHeight: number,
    destWidth: number,
    destHeight: number,
): Uint8ClampedArray {
    const dest = new Uint8ClampedArray(destWidth * destHeight * 4);
    const scale = Math.max(destWidth / srcWidth, destHeight / srcHeight);
    const sampleWidth = destWidth / scale;
    const sampleHeight = destHeight / scale;
    const originX = (srcWidth - sampleWidth) / 2;
    const originY = (srcHeight - sampleHeight) / 2;

    for (let y = 0; y < destHeight; y += 1) {
        const srcY = Math.min(srcHeight - 1, Math.max(0, Math.floor(originY + (y + 0.5) / scale)));
        for (let x = 0; x < destWidth; x += 1) {
            const srcX = Math.min(srcWidth - 1, Math.max(0, Math.floor(originX + (x + 0.5) / scale)));
            const srcIndex = (srcY * srcWidth + srcX) * 4;
            const destIndex = (y * destWidth + x) * 4;
            dest[destIndex] = src[srcIndex] ?? 0;
            dest[destIndex + 1] = src[srcIndex + 1] ?? 0;
            dest[destIndex + 2] = src[srcIndex + 2] ?? 0;
            dest[destIndex + 3] = src[srcIndex + 3] ?? 255;
        }
    }
    return dest;
}

/** CPU-portable WebP → JPEG. No native Sharp / x86-64-v2 requirement. */
export async function convertWebpBufferToJpeg(webpBytes: Buffer): Promise<Buffer> {
    const image = await webp.decode(Uint8Array.from(webpBytes));
    if (!image?.width || !image.height) {
        throw new Error("webp decode produced empty dimensions");
    }
    if (image.width * image.height > MAX_INPUT_PIXELS) {
        throw new Error("webp still exceeds pixel limit");
    }
    const resized = coverResizeRgba(
        image.data,
        image.width,
        image.height,
        SHARE_CARD_STILL_WIDTH,
        SHARE_CARD_STILL_HEIGHT,
    );
    const encoded = jpeg.encode(
        {
            data: Buffer.from(resized),
            width: SHARE_CARD_STILL_WIDTH,
            height: SHARE_CARD_STILL_HEIGHT,
        },
        JPEG_QUALITY,
    );
    if (!encoded.data || encoded.data.length < 4) {
        throw new Error("jpeg encode produced empty output");
    }
    return Buffer.from(encoded.data);
}
