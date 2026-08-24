import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import jpeg from "jpeg-js";

export const SHARE_CARD_STILL_WIDTH = 1200;
export const SHARE_CARD_STILL_HEIGHT = 630;
export const MAX_WEBP_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 80_000_000;
const JPEG_QUALITY = 80;

type WebpImage = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
};

type WebpDecoderModule = {
    decode: (data: ArrayBuffer | Uint8Array) => WebpImage | null;
};

/** On-disk codec files. Do not use package __dirname — Next rewrites it to /ROOT. */
export function webpWasmDecoderFiles(): {factory: string; wasm: string} {
    const dir = path.join(process.cwd(), "node_modules", "webp-wasm");
    return {
        factory: path.join(dir, "webp_node_dec.js"),
        wasm: path.join(dir, "webp_node_dec.wasm"),
    };
}

function ensureImageData(): void {
    if (typeof (globalThis as {ImageData?: unknown}).ImageData === "function") {
        return;
    }
    (globalThis as {ImageData: unknown}).ImageData = class ImageData {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
            this.data = data;
            this.width = width;
            this.height = height;
        }
    };
}

let decoderPromise: Promise<WebpDecoderModule> | null = null;

async function getDecoder(): Promise<WebpDecoderModule> {
    if (!decoderPromise) {
        decoderPromise = (async () => {
            ensureImageData();
            const files = webpWasmDecoderFiles();
            const wasmBinary = await readFile(files.wasm);
            const runtimeRequire = createRequire(files.factory);
            const factory = runtimeRequire(files.factory) as (opts: {
                wasmBinary: Buffer;
            }) => Promise<WebpDecoderModule>;
            return factory({wasmBinary});
        })();
    }
    return decoderPromise;
}

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

export async function decodeWebpRgba(webpBytes: Buffer): Promise<WebpImage> {
    if (webpBytes.length > MAX_WEBP_COMPRESSED_BYTES) {
        throw new Error("webp compressed input exceeds size limit");
    }
    const decoder = await getDecoder();
    const copy = Uint8Array.from(webpBytes);
    const image = decoder.decode(copy);
    if (!image?.width || !image.height) {
        throw new Error("webp decode produced empty dimensions");
    }
    return image;
}

/** CPU-portable WebP → JPEG. No native Sharp / x86-64-v2 requirement. */
export async function convertWebpBufferToJpeg(webpBytes: Buffer): Promise<Buffer> {
    const image = await decodeWebpRgba(webpBytes);
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
