import {lstat, mkdir, readFile, rename, unlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {atomicTempPath} from "@/lib/atomic-file";
import {MAX_PUBLIC_IMAGE_BYTES, openMediaFile} from "@/lib/open-media-file";
import {IMAGE_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";

export const SNAPSHOT_THUMB_EDGE = 640;
export const SNAPSHOT_THUMB_QUALITY = 60;
export const SNAPSHOT_THUMB_CACHE_CONTROL = "public, max-age=31536000, immutable";

const MAX_INPUT_PIXELS = 80_000_000;

export type SnapshotThumbResult =
    | {ok: true; buffer: Buffer; contentType: "image/webp"}
    | {ok: false; status: 400 | 404};

export function snapshotThumbFilename(filename: string): string {
    const extension = path.extname(filename);
    const stem = path.basename(filename, extension);
    return `${stem}.webp`;
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

function thumbFilePath(sourceDir: string, filename: string): string | null {
    if (!isSafeMediaFilename(filename, IMAGE_EXTENSIONS)) {
        return null;
    }
    const root = path.resolve(sourceDir);
    const thumbsDir = path.resolve(root, "thumbs");
    const candidate = path.resolve(thumbsDir, snapshotThumbFilename(filename));
    if (path.dirname(candidate) !== thumbsDir) {
        return null;
    }
    return candidate;
}

async function readStoredThumb(thumbPath: string): Promise<Buffer | null> {
    try {
        const stats = await lstat(thumbPath);
        if (stats.isSymbolicLink() || !stats.isFile() || stats.size > MAX_PUBLIC_IMAGE_BYTES) {
            return null;
        }
        return await readFile(thumbPath);
    } catch {
        return null;
    }
}

async function encodeSnapshotThumb(input: Buffer): Promise<Buffer> {
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
    const thumbPath = thumbFilePath(sourceDir, filename);
    if (!thumbPath) {
        return {ok: false, status: 400};
    }

    const stored = await readStoredThumb(thumbPath);
    if (stored) {
        return {ok: true, buffer: stored, contentType: "image/webp"};
    }

    const opened = await openMediaFile(sourceDir, filename, IMAGE_EXTENSIONS);
    if (!opened.ok) {
        return opened;
    }

    let encoded: Buffer;
    try {
        encoded = await encodeSnapshotThumb(opened.buffer);
    } catch {
        return {ok: false, status: 404};
    }

    const raced = await readStoredThumb(thumbPath);
    if (raced) {
        return {ok: true, buffer: raced, contentType: "image/webp"};
    }

    try {
        await publishThumb(thumbPath, encoded);
    } catch {
        const recovered = await readStoredThumb(thumbPath);
        if (recovered) {
            return {ok: true, buffer: recovered, contentType: "image/webp"};
        }
        return {ok: false, status: 404};
    }

    return {ok: true, buffer: encoded, contentType: "image/webp"};
}
