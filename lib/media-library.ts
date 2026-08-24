import crypto from "node:crypto";
import {mkdir, unlink, readdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {
    encodeUploadedImage,
    type EncodeUploadOptions,
} from "@/lib/image-encode";
import {IMAGE_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";

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

export const MAX_UPLOAD_FILES = 2;
export const MAX_UPLOAD_FILE_BYTES = 15 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 1 * 1024 * 1024;

export type MediaFile = {
    name: string;
    url: string;
};

export type RejectedUpload = {
    name: string;
    reason: "too_large" | "invalid_image" | "encoder_unavailable";
};

export type SaveUploadedImagesResult =
    | {ok: false; error: "no_files" | "too_many_files"}
    | {ok: true; saved: string[]; rejected: RejectedUpload[]};

export type DeleteMediaResult =
    | {ok: true}
    | {ok: false; error: "invalid_filename" | "not_found" | "delete_failed"};

/** Literal path segments per collection keep Turbopack's file tracing statically scoped. */
export function mediaCollectionDir(collection: MediaCollectionId, dirOverride?: string): string {
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
function generatedFileName(prefix: string, extension: string): string {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace("T", "-")
        .slice(0, 15);
    const rand = crypto.randomBytes(3).toString("hex");
    return `${prefix}-${stamp}-${rand}.${extension}`;
}

async function writeWithUniqueName(
    dir: string,
    prefix: string,
    data: Buffer,
    extension: string,
): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const fileName = generatedFileName(prefix, extension);
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
    const dir = mediaCollectionDir(collection, dirOverride);
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

export async function listMediaUrls(
    collection: MediaCollectionId,
    dirOverride?: string,
): Promise<string[]> {
    const files = await listMediaFiles(collection, dirOverride);
    return files.map((file) => file.url);
}

export async function saveUploadedImages(
    collection: MediaCollectionId,
    files: File[],
    dirOverride?: string,
    options: EncodeUploadOptions = {},
): Promise<SaveUploadedImagesResult> {
    if (files.length === 0) {
        return {ok: false, error: "no_files"};
    }
    if (files.length > MAX_UPLOAD_FILES) {
        return {ok: false, error: "too_many_files"};
    }

    const dir = mediaCollectionDir(collection, dirOverride);
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
        const encoded = await encodeUploadedImage(input, options);
        if (!encoded.ok) {
            rejected.push({name: file.name, reason: encoded.reason});
            continue;
        }

        const fileName = await writeWithUniqueName(
            dir,
            COLLECTIONS[collection].filePrefix,
            encoded.value.data,
            encoded.value.extension,
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

    const dir = path.resolve(mediaCollectionDir(collection, dirOverride));
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
