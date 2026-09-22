import {lstat, mkdir, readFile, rename, unlink, writeFile} from "node:fs/promises";
import path from "node:path";
import jpeg from "jpeg-js";
import {atomicTempPath} from "@/lib/atomic-file";
import {getLogger} from "@/lib/logging/logger";
import {MAX_PUBLIC_IMAGE_BYTES, openMediaFile} from "@/lib/open-media-file";
import {IMAGE_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";
import {decodeWebpRgba} from "@/lib/webp-still";

export const SNAPSHOT_THUMB_EDGE = 640;
export const SNAPSHOT_THUMB_QUALITY = 60;
export const SNAPSHOT_THUMB_CACHE_CONTROL = "public, max-age=31536000, immutable";

const MAX_INPUT_PIXELS = 80_000_000;

export type SnapshotThumbContentType = "image/webp" | "image/jpeg";

export type SnapshotThumbResult =
    | {ok: true; buffer: Buffer; contentType: SnapshotThumbContentType}
    | {ok: false; status: 400 | 404};

export type EncodedSnapshotThumb = {
    buffer: Buffer;
    contentType: SnapshotThumbContentType;
};

let sharpUnavailable = false;
let loggedSharpFallback = false;

export function snapshotThumbStem(filename: string): string {
    return path.basename(filename, path.extname(filename));
}

export function snapshotThumbFilenames(filename: string): string[] {
    const stem = snapshotThumbStem(filename);
    return [`${stem}.webp`, `${stem}.jpg`];
}

export function snapshotThumbFilename(filename: string): string {
    return snapshotThumbFilenames(filename)[0] ?? `${snapshotThumbStem(filename)}.webp`;
}

/** Grid image URL. The link keeps the original snapshot URL. */
export function snapshotThumbSrc(url: string): string {
    const hashAt = url.indexOf("#");
    const hash = hashAt === -1 ? "" : url.slice(hashAt);
    const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
    const separator = withoutHash.includes("?") ? "&" : "?";
    return `${withoutHash}${separator}thumb=1${hash}`;
}

export function snapshotThumbResponse(opened: SnapshotThumbResult): Response {
    if (!opened.ok) {
        return new Response(opened.status === 400 ? "Invalid filename" : "File not found", {
            status: opened.status,
            headers: {"Cache-Control": "no-store"},
        });
    }
    return new Response(new Uint8Array(opened.buffer), {
        status: 200,
        headers: {
            "Content-Type": opened.contentType,
            "Cache-Control": SNAPSHOT_THUMB_CACHE_CONTROL,
        },
    });
}

function thumbsDirFor(sourceDir: string, filename: string): string | null {
    if (!isSafeMediaFilename(filename, IMAGE_EXTENSIONS)) {
        return null;
    }
    const root = path.resolve(sourceDir);
    const thumbsDir = path.resolve(root, "thumbs");
    const probe = path.resolve(thumbsDir, snapshotThumbFilename(filename));
    if (path.dirname(probe) !== thumbsDir) {
        return null;
    }
    return thumbsDir;
}

function contentTypeForThumb(bytes: Buffer, filePath: string): SnapshotThumbContentType {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        bytes.length >= 12
        && bytes.toString("ascii", 0, 4) === "RIFF"
        && bytes.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }
    return filePath.endsWith(".jpg") ? "image/jpeg" : "image/webp";
}

async function readStoredFile(filePath: string): Promise<EncodedSnapshotThumb | null> {
    try {
        const stats = await lstat(filePath);
        if (stats.isSymbolicLink() || !stats.isFile() || stats.size > MAX_PUBLIC_IMAGE_BYTES) {
            return null;
        }
        const buffer = await readFile(filePath);
        return {buffer, contentType: contentTypeForThumb(buffer, filePath)};
    } catch {
        return null;
    }
}

async function readStoredThumb(thumbsDir: string, filename: string): Promise<EncodedSnapshotThumb | null> {
    for (const name of snapshotThumbFilenames(filename)) {
        const stored = await readStoredFile(path.join(thumbsDir, name));
        if (stored) {
            return stored;
        }
    }
    return null;
}

function sharpCannotLoad(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
        message.includes("Could not load")
        || message.includes("Unsupported CPU")
        || message.includes("Cannot find module")
    );
}

function noteSharpFallback(error: unknown): void {
    if (loggedSharpFallback) {
        return;
    }
    loggedSharpFallback = true;
    const message = error instanceof Error ? error.message : String(error);
    getLogger().warn({err: message}, "native sharp unavailable, snapshot thumbs use the portable encoder");
}

function fitInside(width: number, height: number, maxEdge: number): {width: number; height: number} {
    if (width <= maxEdge && height <= maxEdge) {
        return {width, height};
    }
    const scale = Math.min(maxEdge / width, maxEdge / height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function resizeRgba(
    src: Uint8Array | Uint8ClampedArray,
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

function encodeJpegRgba(rgba: Buffer, width: number, height: number): Buffer {
    const encoded = jpeg.encode({data: rgba, width, height}, SNAPSHOT_THUMB_QUALITY);
    if (!encoded.data || encoded.data.length < 4) {
        throw new Error("jpeg encode produced empty output");
    }
    return Buffer.from(encoded.data);
}

function isJpeg(input: Buffer): boolean {
    return input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

/** Snapshot still to a 640 px JPEG. No native sharp. */
export async function encodePortableSnapshotThumb(input: Buffer): Promise<Buffer> {
    if (isJpeg(input)) {
        const decoded = jpeg.decode(input, {
            maxResolutionInMP: 80,
            maxMemoryUsageInMB: 512,
        });
        if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_INPUT_PIXELS) {
            throw new Error("snapshot thumb exceeds pixel limit");
        }
        const fitted = fitInside(decoded.width, decoded.height, SNAPSHOT_THUMB_EDGE);
        const rgba =
            fitted.width === decoded.width && fitted.height === decoded.height
                ? Buffer.from(decoded.data)
                : resizeRgba(decoded.data, decoded.width, decoded.height, fitted.width, fitted.height);
        return encodeJpegRgba(rgba, fitted.width, fitted.height);
    }

    const image = await decodeWebpRgba(input);
    if (image.width * image.height > MAX_INPUT_PIXELS) {
        throw new Error("snapshot thumb exceeds pixel limit");
    }
    const fitted = fitInside(image.width, image.height, SNAPSHOT_THUMB_EDGE);
    const rgba =
        fitted.width === image.width && fitted.height === image.height
            ? Buffer.from(image.data)
            : resizeRgba(image.data, image.width, image.height, fitted.width, fitted.height);
    return encodeJpegRgba(rgba, fitted.width, fitted.height);
}

async function encodeWithSharp(input: Buffer): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp(input, {limitInputPixels: MAX_INPUT_PIXELS})
        .rotate()
        .resize({
            width: SNAPSHOT_THUMB_EDGE,
            height: SNAPSHOT_THUMB_EDGE,
            fit: "inside",
            withoutEnlargement: true,
        })
        .webp({quality: SNAPSHOT_THUMB_QUALITY})
        .toBuffer();
}

async function encodeSnapshotThumb(input: Buffer): Promise<EncodedSnapshotThumb> {
    if (!sharpUnavailable) {
        try {
            return {buffer: await encodeWithSharp(input), contentType: "image/webp"};
        } catch (error) {
            if (sharpCannotLoad(error)) {
                sharpUnavailable = true;
                noteSharpFallback(error);
            }
        }
    }
    return {buffer: await encodePortableSnapshotThumb(input), contentType: "image/jpeg"};
}

async function publishThumb(thumbPath: string, data: Buffer): Promise<void> {
    await mkdir(path.dirname(thumbPath), {recursive: true});
    const temporary = atomicTempPath(thumbPath);
    try {
        await writeFile(temporary, data);
        try {
            await rename(temporary, thumbPath);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST" && code !== "EPERM") {
                throw error;
            }
            await unlink(thumbPath);
            await rename(temporary, thumbPath);
        }
    } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}

/** Return the stored thumb, creating it from the original on the first request. */
export async function openSnapshotThumb(
    sourceDir: string,
    filename: string,
): Promise<SnapshotThumbResult> {
    const thumbsDir = thumbsDirFor(sourceDir, filename);
    if (!thumbsDir) {
        return {ok: false, status: 400};
    }

    const stored = await readStoredThumb(thumbsDir, filename);
    if (stored) {
        return {ok: true, ...stored};
    }

    const opened = await openMediaFile(sourceDir, filename, IMAGE_EXTENSIONS);
    if (!opened.ok) {
        return opened;
    }

    let encoded: EncodedSnapshotThumb;
    try {
        encoded = await encodeSnapshotThumb(opened.buffer);
    } catch {
        return {ok: false, status: 404};
    }

    const raced = await readStoredThumb(thumbsDir, filename);
    if (raced) {
        return {ok: true, ...raced};
    }

    const thumbPath = path.join(
        thumbsDir,
        encoded.contentType === "image/jpeg" ? `${snapshotThumbStem(filename)}.jpg` : snapshotThumbFilename(filename),
    );
    try {
        await publishThumb(thumbPath, encoded.buffer);
    } catch {
        const recovered = await readStoredThumb(thumbsDir, filename);
        if (recovered) {
            return {ok: true, ...recovered};
        }
    }

    return {ok: true, ...encoded};
}
