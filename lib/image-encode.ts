import jpeg from "jpeg-js";
import {decodeWebpRgba} from "@/lib/webp-still";

export const MAX_OUTPUT_DIMENSION = 2560;
const WEBP_QUALITY = 82;
const JPEG_QUALITY = 82;
const MAX_INPUT_PIXELS = 80_000_000;
/** jpeg-js needs ~11 bytes/pixel; 24MP iPhone photos overflow the old 256 MB cap. */
export const JPEG_DECODE_MAX_MEMORY_MB = 512;
export const JPEG_DECODE_MAX_RESOLUTION_MP = 80;
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

function jpegExifOrientation(input: Buffer): number {
    let offset = 2;
    while (offset + 4 <= input.length) {
        if (input[offset] !== 0xff) {
            break;
        }
        const marker = input[offset + 1];
        if (marker === 0xda || marker === 0xd9) {
            break;
        }
        const size = input.readUInt16BE(offset + 2);
        if (size < 2 || offset + 2 + size > input.length) {
            break;
        }
        if (marker === 0xe1) {
            const payload = offset + 4;
            if (
                payload + 6 <= input.length
                && input.toString("ascii", payload, payload + 4) === "Exif"
                && input[payload + 4] === 0
                && input[payload + 5] === 0
            ) {
                const value = readTiffOrientation(input, payload + 6);
                if (value !== null) {
                    return value;
                }
            }
        }
        offset += 2 + size;
    }
    return 1;
}

function readTiffOrientation(buffer: Buffer, tiffStart: number): number | null {
    if (tiffStart + 8 > buffer.length) {
        return null;
    }
    const order = buffer.toString("ascii", tiffStart, tiffStart + 2);
    const little = order === "II";
    if (!little && order !== "MM") {
        return null;
    }
    const u16 = (at: number) =>
        little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
    const u32 = (at: number) =>
        little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at);
    if (u16(tiffStart + 2) !== 42) {
        return null;
    }
    const ifd = tiffStart + u32(tiffStart + 4);
    if (ifd + 2 > buffer.length) {
        return null;
    }
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > buffer.length) {
            return null;
        }
        if (u16(entry) !== 0x0112) {
            continue;
        }
        const type = u16(entry + 2);
        const n = u32(entry + 4);
        if (n !== 1) {
            return 1;
        }
        const value = type === 3 ? u16(entry + 8) : u32(entry + 8);
        if (value >= 1 && value <= 8) {
            return value;
        }
        return 1;
    }
    return 1;
}

function applyJpegOrientation(
    src: Uint8Array | Uint8ClampedArray | Buffer,
    width: number,
    height: number,
    orientation: number,
): {data: Buffer; width: number; height: number} {
    if (orientation <= 1 || orientation > 8) {
        return {data: Buffer.from(src), width, height};
    }
    const swap = orientation >= 5;
    const destWidth = swap ? height : width;
    const destHeight = swap ? width : height;
    const dest = Buffer.alloc(destWidth * destHeight * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let dx = x;
            let dy = y;
            switch (orientation) {
                case 2:
                    dx = width - 1 - x;
                    dy = y;
                    break;
                case 3:
                    dx = width - 1 - x;
                    dy = height - 1 - y;
                    break;
                case 4:
                    dx = x;
                    dy = height - 1 - y;
                    break;
                case 5:
                    dx = y;
                    dy = x;
                    break;
                case 6:
                    dx = height - 1 - y;
                    dy = x;
                    break;
                case 7:
                    dx = height - 1 - y;
                    dy = width - 1 - x;
                    break;
                case 8:
                    dx = y;
                    dy = width - 1 - x;
                    break;
                default:
                    break;
            }
            const si = (y * width + x) * 4;
            const di = (dy * destWidth + dx) * 4;
            dest[di] = src[si] ?? 0;
            dest[di + 1] = src[si + 1] ?? 0;
            dest[di + 2] = src[si + 2] ?? 0;
            dest[di + 3] = src[si + 3] ?? 255;
        }
    }
    return {data: dest, width: destWidth, height: destHeight};
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
            decoded = jpeg.decode(input, {
                maxResolutionInMP: JPEG_DECODE_MAX_RESOLUTION_MP,
                maxMemoryUsageInMB: JPEG_DECODE_MAX_MEMORY_MB,
            });
        } catch {
            return {ok: false, reason: "invalid_image"};
        }
        if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_INPUT_PIXELS) {
            return {ok: false, reason: "invalid_image"};
        }
        const oriented = applyJpegOrientation(
            decoded.data,
            decoded.width,
            decoded.height,
            jpegExifOrientation(input),
        );
        const fitted = fitInside(oriented.width, oriented.height, MAX_OUTPUT_DIMENSION);
        const rgba =
            fitted.width === oriented.width && fitted.height === oriented.height
                ? oriented.data
                : resizeRgba(
                    oriented.data,
                    oriented.width,
                    oriented.height,
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

export async function rotateUploadedImage(
    input: Buffer,
    options: EncodeUploadOptions = {},
): Promise<EncodeUploadResult> {
    if (options.allowSharp !== false) {
        try {
            const sharp = (await import("sharp")).default;
            const data = await sharp(input, {limitInputPixels: MAX_INPUT_PIXELS})
                .rotate(90)
                .resize({
                    width: MAX_OUTPUT_DIMENSION,
                    height: MAX_OUTPUT_DIMENSION,
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .webp({quality: WEBP_QUALITY})
                .toBuffer();
            return {ok: true, value: {data, extension: "webp"}};
        } catch {
            /* Sharp unavailable */
        }
    }

    const format = sniffFormat(input);
    if (format === "png" || format === null) {
        return {ok: false, reason: format === "png" ? "encoder_unavailable" : "invalid_image"};
    }

    let width: number;
    let height: number;
    let pixels: Buffer;
    if (format === "jpeg") {
        let decoded: {data: Buffer; width: number; height: number};
        try {
            decoded = jpeg.decode(input, {
                maxResolutionInMP: JPEG_DECODE_MAX_RESOLUTION_MP,
                maxMemoryUsageInMB: JPEG_DECODE_MAX_MEMORY_MB,
            });
        } catch {
            return {ok: false, reason: "invalid_image"};
        }
        const oriented = applyJpegOrientation(
            decoded.data,
            decoded.width,
            decoded.height,
            jpegExifOrientation(input),
        );
        width = oriented.width;
        height = oriented.height;
        pixels = oriented.data;
    } else {
        let image;
        try {
            image = await decodeWebpRgba(input);
        } catch {
            return {ok: false, reason: "encoder_unavailable"};
        }
        width = image.width;
        height = image.height;
        pixels = Buffer.from(image.data);
    }

    const turned = applyJpegOrientation(pixels, width, height, 6);
    const fitted = fitInside(turned.width, turned.height, MAX_OUTPUT_DIMENSION);
    const rgba =
        fitted.width === turned.width && fitted.height === turned.height
            ? turned.data
            : resizeRgba(
                turned.data,
                turned.width,
                turned.height,
                fitted.width,
                fitted.height,
            );
    return encodeJpegRgba(rgba, fitted.width, fitted.height);
}
