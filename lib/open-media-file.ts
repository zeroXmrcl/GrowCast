import {createReadStream} from "node:fs";
import {lstat, readFile, realpath} from "node:fs/promises";
import {Readable} from "node:stream";
import path from "node:path";
import {IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, isSafeMediaFilename} from "@/lib/safe-media-filename";

export const MAX_PUBLIC_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_PUBLIC_VIDEO_BYTES = 512 * 1024 * 1024;
/** Streamed video can be longer than the buffered cap. */
export const MAX_STREAM_VIDEO_BYTES = 8 * 1024 * 1024 * 1024;

export function bytesForResponse(buffer: Buffer): Uint8Array<ArrayBuffer> {
    if (buffer.buffer instanceof ArrayBuffer) {
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    return new Uint8Array(buffer);
}

export type ByteRange = {start: number; end: number};

/** `bytes=start-end`. Returns null when the header is absent or not a single range. */
export function parseByteRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
    if (!header || size <= 0) {
        return header ? "unsatisfiable" : null;
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) {
        return null;
    }
    const startText = match[1] ?? "";
    const endText = match[2] ?? "";
    if (startText === "" && endText === "") {
        return null;
    }
    if (startText === "") {
        const suffix = Number(endText);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) {
            return "unsatisfiable";
        }
        return {start: Math.max(0, size - suffix), end: size - 1};
    }
    const start = Number(startText);
    const end = endText === "" ? size - 1 : Number(endText);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
        return "unsatisfiable";
    }
    return {start, end: Math.min(end, size - 1)};
}

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

function streamFileResponse(
    filePath: string,
    size: number,
    contentType: string,
    request: Request,
    cacheControl: string,
): Response {
    const range = parseByteRange(request.headers.get("range"), size);
    if (range === "unsatisfiable") {
        return new Response(null, {
            status: 416,
            headers: {
                "Content-Range": `bytes */${size}`,
                "Accept-Ranges": "bytes",
                "Cache-Control": cacheControl,
            },
        });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const nodeStream = createReadStream(filePath, {start, end});
    const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
    };
    if (range) {
        headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    return new Response(body, {status: range ? 206 : 200, headers});
}

/** Stream a file inside rootDir. Supports a single Range request so video does not load into memory. */
export async function streamMediaFile(
    rootDir: string,
    filename: string,
    request: Request,
    allowedExtensions: Set<string>,
    cacheControl: string,
): Promise<Response> {
    if (!isSafeMediaFilename(filename, allowedExtensions)) {
        return new Response("Invalid filename", {status: 400, headers: {"Cache-Control": "no-store"}});
    }
    const root = path.resolve(rootDir);
    const candidate = path.resolve(root, filename);
    if (path.dirname(candidate) !== root) {
        return new Response("Invalid filename", {status: 400, headers: {"Cache-Control": "no-store"}});
    }
    return streamResolvedFile(candidate, filename, request, cacheControl);
}

export async function streamFixedMediaFile(
    filePath: string,
    request: Request,
    allowedExtensions: Set<string>,
    cacheControl: string,
): Promise<Response> {
    const filename = path.basename(filePath);
    if (!isSafeMediaFilename(filename, allowedExtensions)) {
        return new Response("Invalid filename", {status: 400, headers: {"Cache-Control": "no-store"}});
    }
    return streamResolvedFile(path.resolve(filePath), filename, request, cacheControl);
}

async function streamResolvedFile(
    resolved: string,
    filename: string,
    request: Request,
    cacheControl: string,
): Promise<Response> {
    try {
        const stats = await lstat(resolved);
        if (stats.isSymbolicLink() || !stats.isFile() || stats.size > MAX_STREAM_VIDEO_BYTES) {
            return new Response("File not found", {status: 404, headers: {"Cache-Control": "no-store"}});
        }
        const realFile = await realpath(resolved);
        if (realFile !== resolved) {
            const realStats = await lstat(realFile);
            if (!realStats.isFile()) {
                return new Response("File not found", {status: 404, headers: {"Cache-Control": "no-store"}});
            }
        }
        return streamFileResponse(realFile, stats.size, contentTypeFor(filename), request, cacheControl);
    } catch {
        return new Response("File not found", {status: 404, headers: {"Cache-Control": "no-store"}});
    }
}
