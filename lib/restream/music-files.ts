import {chmod, mkdir, readdir, rename, unlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {atomicTempPath} from "@/lib/atomic-file";
import {isSafeMediaFilename} from "@/lib/safe-media-filename";
import {restreamMusicDir} from "@/lib/restream/paths";

export const MUSIC_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".m4a"]);
export const MUSIC_MAX_BYTES = 20 * 1024 * 1024;
export const MUSIC_MAX_FILES = 30;

export type SaveMusicResult =
    | {ok: true; filename: string}
    | {ok: false; error: "invalid_name" | "too_large" | "too_many"};

export type DeleteMusicResult = {ok: true} | {ok: false; error: "invalid_name"};

async function atomicWriteBuffer(filePath: string, contents: Buffer): Promise<void> {
    await mkdir(path.dirname(filePath), {recursive: true});
    const tmp = atomicTempPath(filePath);
    try {
        await writeFile(tmp, contents);
        await rename(tmp, filePath);
    } catch (error) {
        await unlink(tmp).catch(() => undefined);
        throw error;
    }
}

export async function listMusicFiles(): Promise<string[]> {
    const dir = restreamMusicDir();
    let names: string[];
    try {
        names = await readdir(dir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        throw error;
    }
    return names.filter((name) => isSafeMediaFilename(name, MUSIC_EXTENSIONS)).sort();
}

export async function saveMusicFile(filename: string, data: Buffer): Promise<SaveMusicResult> {
    if (!isSafeMediaFilename(filename, MUSIC_EXTENSIONS)) {
        return {ok: false, error: "invalid_name"};
    }
    if (data.byteLength > MUSIC_MAX_BYTES) {
        return {ok: false, error: "too_large"};
    }

    const dir = restreamMusicDir();
    await mkdir(dir, {recursive: true});
    await chmod(dir, 0o700).catch(() => undefined);

    const existing = await listMusicFiles();
    if (!existing.includes(filename) && existing.length >= MUSIC_MAX_FILES) {
        return {ok: false, error: "too_many"};
    }

    const filePath = path.join(dir, filename);
    await atomicWriteBuffer(filePath, data);
    await chmod(filePath, 0o600);

    return {ok: true, filename};
}

export async function deleteMusicFile(filename: string): Promise<DeleteMusicResult> {
    if (!isSafeMediaFilename(filename, MUSIC_EXTENSIONS)) {
        return {ok: false, error: "invalid_name"};
    }

    const dir = path.resolve(restreamMusicDir());
    const filePath = path.resolve(dir, filename);
    if (path.dirname(filePath) !== dir) {
        return {ok: false, error: "invalid_name"};
    }

    try {
        await unlink(filePath);
        return {ok: true};
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {ok: true};
        }
        throw error;
    }
}
