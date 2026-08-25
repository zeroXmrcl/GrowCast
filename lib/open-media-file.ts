import {lstat, readFile, realpath} from "node:fs/promises";
import path from "node:path";
import {IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";

export const MAX_PUBLIC_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_PUBLIC_VIDEO_BYTES = 512 * 1024 * 1024;

export type OpenMediaResult =
    | {ok: true; buffer: Buffer; contentType: string}
    | {ok: false; status: 400 | 404};

function maxBytesFor(allowedExtensions: Set<string>): number {
    for (const ext of allowedExtensions) {
        if (VIDEO_EXTENSIONS.has(ext)) {
            return MAX_PUBLIC_VIDEO_BYTES;
        }
    }
    return MAX_PUBLIC_IMAGE_BYTES;
}

function contentTypeFor(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".webp")) {
        return "image/webp";
    }
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        return "image/jpeg";
    }
    if (lower.endsWith(".png")) {
        return "image/png";
    }
    if (lower.endsWith(".mp4")) {
        return "video/mp4";
    }
    return "application/octet-stream";
}

function isInsideRoot(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function openMediaFile(
    rootDir: string,
    filename: string,
    allowedExtensions: Set<string> = IMAGE_EXTENSIONS,
): Promise<OpenMediaResult> {
    if (!isSafeMediaFilename(filename, allowedExtensions)) {
        return {ok: false, status: 400};
    }

    const root = path.resolve(rootDir);
    const candidate = path.resolve(root, filename);
    if (path.dirname(candidate) !== root) {
        return {ok: false, status: 400};
    }

    try {
        const stats = await lstat(candidate);
        if (stats.isSymbolicLink() || !stats.isFile()) {
            return {ok: false, status: 404};
        }
        if (stats.size > maxBytesFor(allowedExtensions)) {
            return {ok: false, status: 404};
        }

        const realRoot = await realpath(root);
        const realFile = await realpath(candidate);
        if (realFile !== path.join(realRoot, filename) && !isInsideRoot(realRoot, realFile)) {
            return {ok: false, status: 404};
        }

        const buffer = await readFile(candidate);
        return {ok: true, buffer, contentType: contentTypeFor(filename)};
    } catch {
        return {ok: false, status: 404};
    }
}

export async function openFixedMediaFile(
    filePath: string,
    allowedExtensions: Set<string> = VIDEO_EXTENSIONS,
): Promise<OpenMediaResult> {
    const filename = path.basename(filePath);
    if (!isSafeMediaFilename(filename, allowedExtensions)) {
        return {ok: false, status: 400};
    }

    const resolved = path.resolve(filePath);
    try {
        const stats = await lstat(resolved);
        if (stats.isSymbolicLink() || !stats.isFile()) {
            return {ok: false, status: 404};
        }
        if (stats.size > maxBytesFor(allowedExtensions)) {
            return {ok: false, status: 404};
        }
        const buffer = await readFile(resolved);
        return {ok: true, buffer, contentType: contentTypeFor(filename)};
    } catch {
        return {ok: false, status: 404};
    }
}
