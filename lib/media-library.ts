import crypto from "node:crypto";
import {mkdir, unlink, readdir, writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const MEDIA_COLLECTION_IDS = ["setup", "dashboard"] as const;
export type MediaCollectionId = (typeof MEDIA_COLLECTION_IDS)[number];

export function isMediaCollectionId(value: string): value is MediaCollectionId {
    return (MEDIA_COLLECTION_IDS as readonly string[]).includes(value);
}

type MediaCollectionConfig = {
    urlPrefix: string;
    filePrefix: string;
};

const COLLECTIONS: Record<MediaCollectionId, MediaCollectionConfig> = {
    setup: {urlPrefix: "/setup", filePrefix: "setup"},
    dashboard: {urlPrefix: "/yourPictures", filePrefix: "picture"},
};

export const MAX_UPLOAD_FILES = 10;
export const MAX_UPLOAD_FILE_BYTES = 15 * 1024 * 1024;

/** Output cap keeps public pages fast while staying sharp on large screens. */
const MAX_OUTPUT_DIMENSION = 2560;
const WEBP_QUALITY = 82;
/** Decode guard against decompression bombs (~80MP). */
const MAX_INPUT_PIXELS = 80_000_000;

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);

export type MediaFile = {
    name: string;
    url: string;
};

export type RejectedUpload = {
    name: string;
    reason: "too_large" | "invalid_image";
};

export type SaveUploadedImagesResult =
    | {ok: false; error: "no_files" | "too_many_files"}
    | {ok: true; saved: string[]; rejected: RejectedUpload[]};

export type DeleteMediaResult =
    | {ok: true}
    | {ok: false; error: "invalid_filename" | "not_found" | "delete_failed"};

/** Literal path segments per collection keep Turbopack's file tracing statically scoped. */
function collectionDir(collection: MediaCollectionId, dirOverride?: string): string {
    if (dirOverride) {
        return dirOverride;
    }
    return collection === "setup"
        ? path.join(process.cwd(), "public", "setup")
        : path.join(process.cwd(), "public", "yourPictures");
}

/**
 * Server-generated names only — the client filename never reaches the
 * filesystem. Timestamp prefix keeps the ascending display order stable.
 */
function generatedFileName(prefix: string): string {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace("T", "-")
        .slice(0, 15);
    const rand = crypto.randomBytes(3).toString("hex");
    return `${prefix}-${stamp}-${rand}.webp`;
}

function isSafeMediaFilename(name: string): boolean {
    if (name.length === 0 || name.length > 255) {
        return false;
    }
    if (name.startsWith(".")) {
        return false;
    }
    if (
        name.includes("/") ||
        name.includes("\\") ||
        name.includes("..") ||
        name.includes("\0")
    ) {
        return false;
    }
    return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/**
 * Decode-validate and re-encode an upload. Returns null when the bytes are
 * not a real jpeg/png/webp image. Re-encoding strips all metadata (EXIF/GPS)
 * after `.rotate()` has applied the EXIF orientation.
 */
async function encodeImage(input: Buffer): Promise<Buffer | null> {
    try {
        const metadata = await sharp(input, {limitInputPixels: MAX_INPUT_PIXELS}).metadata();
        if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
            return null;
        }

        return await sharp(input, {limitInputPixels: MAX_INPUT_PIXELS})
            .rotate()
            .resize({
                width: MAX_OUTPUT_DIMENSION,
                height: MAX_OUTPUT_DIMENSION,
                fit: "inside",
                withoutEnlargement: true,
            })
            .webp({quality: WEBP_QUALITY})
            .toBuffer();
    } catch {
        return null;
    }
}

async function writeWithUniqueName(
    dir: string,
    prefix: string,
    data: Buffer,
): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const fileName = generatedFileName(prefix);
        try {
            await writeFile(path.join(dir, fileName), data, {flag: "wx"});
            return fileName;
        } catch (error) {
            lastError = error;
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not allocate file name");
}

export async function listMediaFiles(
    collection: MediaCollectionId,
    dirOverride?: string,
): Promise<MediaFile[]> {
    const dir = collectionDir(collection, dirOverride);
    const {urlPrefix} = COLLECTIONS[collection];

    try {
        const entries = await readdir(dir, {withFileTypes: true});
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: "base"}))
            .map((name) => ({name, url: `${urlPrefix}/${encodeURIComponent(name)}`}));
    } catch {
        return [];
    }
}

export async function saveUploadedImages(
    collection: MediaCollectionId,
    files: File[],
    dirOverride?: string,
): Promise<SaveUploadedImagesResult> {
    if (files.length === 0) {
        return {ok: false, error: "no_files"};
    }
    if (files.length > MAX_UPLOAD_FILES) {
        return {ok: false, error: "too_many_files"};
    }

    const dir = collectionDir(collection, dirOverride);
    await mkdir(dir, {recursive: true});

    const saved: string[] = [];
    const rejected: RejectedUpload[] = [];

    for (const file of files) {
        if (file.size === 0 || file.size > MAX_UPLOAD_FILE_BYTES) {
            rejected.push({
                name: file.name,
                reason: file.size === 0 ? "invalid_image" : "too_large",
            });
            continue;
        }

        const input = Buffer.from(await file.arrayBuffer());
        const encoded = await encodeImage(input);
        if (!encoded) {
            rejected.push({name: file.name, reason: "invalid_image"});
            continue;
        }

        const fileName = await writeWithUniqueName(
            dir,
            COLLECTIONS[collection].filePrefix,
            encoded,
        );
        saved.push(fileName);
    }

    return {ok: true, saved, rejected};
}

export async function deleteMediaFile(
    collection: MediaCollectionId,
    filename: string,
    dirOverride?: string,
): Promise<DeleteMediaResult> {
    if (!isSafeMediaFilename(filename)) {
        return {ok: false, error: "invalid_filename"};
    }

    const dir = path.resolve(collectionDir(collection, dirOverride));
    const filePath = path.resolve(dir, filename);
    if (path.dirname(filePath) !== dir) {
        return {ok: false, error: "invalid_filename"};
    }

    try {
        await unlink(filePath);
        return {ok: true};
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {ok: false, error: "not_found"};
        }
        return {ok: false, error: "delete_failed"};
    }
}
