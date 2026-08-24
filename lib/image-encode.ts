import jpeg from "jpeg-js";
import {decodeWebpRgba} from "@/lib/webp-still";

export const MAX_OUTPUT_DIMENSION = 2560;
const WEBP_QUALITY = 82;
const JPEG_QUALITY = 82;
const MAX_INPUT_PIXELS = 80_000_000;
const ALLOWED_SHARP_FORMATS = new Set(["jpeg", "png", "webp"]);

export type EncodedUpload = {
    data: Buffer;
    extension: "webp" | "jpeg" | "png";
};

export type EncodeUploadResult =
    | {ok: true; value: EncodedUpload}
    | {ok: false; reason: "invalid_image" | "encoder_unavailable"};

export type EncodeUploadOptions = {
    allowSharp?: boolean;
};

function sniffFormat(input: Buffer): "jpeg" | "png" | "webp" | null {
    if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) {
        return "jpeg";
    }
    if (
        input.length >= 8
        && input[0] === 0x89
        && input[1] === 0x50
        && input[2] === 0x4e
        && input[3] === 0x47
    ) {
        return "png";
    }
    if (
        input.length >= 12
        && input.toString("ascii", 0, 4) === "RIFF"
        && input.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "webp";
    }
    return null;
}

function pngDimensions(input: Buffer): {width: number; height: number} | null {
    if (input.length < 24 || input.toString("ascii", 12, 16) !== "IHDR") {
        return null;
    }
    const width = input.readUInt32BE(16);
    const height = input.readUInt32BE(20);
    if (width === 0 || height === 0) {
        return null;
    }
    return {width, height};
}

function fitInside(width: number, height: number, max: number): {width: number; height: number} {
    if (width <= max && height <= max) {
        return {width, height};
    }
    const scale = Math.min(max / width, max / height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function resizeRgba(
    src: Uint8Array | Uint8ClampedArray | Buffer,
    srcWidth: number,
    srcHeight: number,
    destWidth: number,
    destHeight: number,
): Buffer {
    const dest = Buffer.alloc(destWidth * destHeight * 4);
    for (let y = 0; y < destHeight; y += 1) {
        const srcY = Math.min(srcHeight - 1, Math.floor(((y + 0.5) * srcHeight) / destHeight));
        for (let x = 0; x < destWidth; x += 1) {
            const srcX = Math.min(srcWidth - 1, Math.floor(((x + 0.5) * srcWidth) / destWidth));
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

function encodeJpegRgba(
    rgba: Uint8Array | Uint8ClampedArray | Buffer,
    width: number,
    height: number,
): EncodeUploadResult {
    const encoded = jpeg.encode(
        {data: Buffer.from(rgba), width, height},
        JPEG_QUALITY,
    );
    if (!encoded.data || encoded.data.length < 4) {
        return {ok: false, reason: "encoder_unavailable"};
    }
    return {ok: true, value: {data: Buffer.from(encoded.data), extension: "jpeg"}};
}

async function encodeWithSharp(input: Buffer): Promise<EncodeUploadResult> {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(input, {limitInputPixels: MAX_INPUT_PIXELS}).metadata();
    if (!metadata.format || !ALLOWED_SHARP_FORMATS.has(metadata.format)) {
        return {ok: false, reason: "invalid_image"};
    }
    const data = await sharp(input, {limitInputPixels: MAX_INPUT_PIXELS})
        .rotate()
        .resize({
            width: MAX_OUTPUT_DIMENSION,
            height: MAX_OUTPUT_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
        })
        .webp({quality: WEBP_QUALITY})
        .toBuffer();
    return {ok: true, value: {data, extension: "webp"}};
}

async function encodePortable(input: Buffer): Promise<EncodeUploadResult> {
    const format = sniffFormat(input);
    if (!format) {
        return {ok: false, reason: "invalid_image"};
    }
    if (format === "png") {
        const dim = pngDimensions(input);
        if (!dim || dim.width * dim.height > MAX_INPUT_PIXELS) {
            return {ok: false, reason: "invalid_image"};
        }
        return {ok: true, value: {data: input, extension: "png"}};
    }
    if (format === "jpeg") {
        let decoded: {data: Buffer; width: number; height: number};
        try {
            decoded = jpeg.decode(input, {maxResolutionInMP: 80, maxMemoryUsageInMB: 256});
        } catch {
            return {ok: false, reason: "invalid_image"};
        }
        if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_INPUT_PIXELS) {
            return {ok: false, reason: "invalid_image"};
        }
        const fitted = fitInside(decoded.width, decoded.height, MAX_OUTPUT_DIMENSION);
        const rgba =
            fitted.width === decoded.width && fitted.height === decoded.height
                ? decoded.data
                : resizeRgba(
                    decoded.data,
                    decoded.width,
                    decoded.height,
                    fitted.width,
                    fitted.height,
                );
        return encodeJpegRgba(rgba, fitted.width, fitted.height);
    }

    let image;
    try {
        image = await decodeWebpRgba(input);
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("webp decode produced empty")) {
            return {ok: false, reason: "invalid_image"};
        }
        return {ok: false, reason: "encoder_unavailable"};
    }
    if (image.width * image.height > MAX_INPUT_PIXELS) {
        return {ok: false, reason: "invalid_image"};
    }
    const fitted = fitInside(image.width, image.height, MAX_OUTPUT_DIMENSION);
    const rgba =
        fitted.width === image.width && fitted.height === image.height
            ? image.data
            : resizeRgba(image.data, image.width, image.height, fitted.width, fitted.height);
    return encodeJpegRgba(rgba, fitted.width, fitted.height);
}

export async function encodeUploadedImage(
    input: Buffer,
    options: EncodeUploadOptions = {},
): Promise<EncodeUploadResult> {
    if (options.allowSharp !== false) {
        try {
            return await encodeWithSharp(input);
        } catch {
            /* Sharp unavailable */
        }
    }
    return encodePortable(input);
}
