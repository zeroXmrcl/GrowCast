import {createHash} from "node:crypto";
import {readdir, readFile, stat} from "node:fs/promises";
import path from "node:path";

const SKIP_DIR_NAMES = new Set([
    "__pycache__",
    "node_modules",
    ".git",
    ".venv",
    "dist-info",
    "snapshots",
    "timelapse",
    "media",
    "coverage",
]);

const SKIP_FILE_NAMES = new Set([".ds_store", "thumbs.db"]);

function shouldSkipDir(name: string, relativeParent = ""): boolean {
    if (SKIP_DIR_NAMES.has(name) || name.startsWith(".")) {
        return true;
    }
    // host/dist is a build artifact (core bundles it on start). ui/dist is the shipped UI pin.
    return name === "dist" && (relativeParent === "host" || relativeParent.endsWith("/host"));
}

function shouldSkipFile(name: string): boolean {
    const lower = name.toLowerCase();
    return SKIP_FILE_NAMES.has(lower) || lower.endsWith(".pyc") || lower.endsWith(".pyo");
}

async function listFiles(root: string, relative = ""): Promise<string[]> {
    const dir = relative ? path.join(root, relative) : root;
    const entries = await readdir(dir, {withFileTypes: true});
    const files: string[] = [];
    for (const entry of entries) {
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (shouldSkipDir(entry.name, relative)) {
                continue;
            }
            files.push(...await listFiles(root, rel));
            continue;
        }
        if (!entry.isFile() || shouldSkipFile(entry.name)) {
            continue;
        }
        files.push(rel);
    }
    return files;
}

type HashCacheEntry = {signature: string; hash: string};

const hashCache = new Map<string, HashCacheEntry>();

export function _resetPluginHashCacheForTests(): void {
    hashCache.clear();
}

function stampOf(info: {size: number; mtimeNs?: bigint; mtimeMs: number}): string {
    const mtime = typeof info.mtimeNs === "bigint" ? info.mtimeNs.toString() : String(Math.trunc(info.mtimeMs));
    return `${info.size}\0${mtime}`;
}

/** Cheap identity of the hashed files. Content is read again only when this changes. */
export async function pluginFolderSignature(folderPath: string): Promise<string> {
    const files = (await listFiles(folderPath)).sort((a, b) => a.localeCompare(b));
    const parts: string[] = [];
    for (const rel of files) {
        const info = await stat(path.join(folderPath, rel));
        parts.push(`${rel}\0${stampOf(info)}`);
    }
    return parts.join("\n");
}

async function hashListed(folderPath: string, signature: string): Promise<string> {
    const files = signature.length === 0 ? [] : signature.split("\n").map((line) => line.split("\0")[0] ?? "");
    const outer = createHash("sha256");
    for (const rel of files) {
        const abs = path.join(folderPath, rel);
        const info = await stat(abs);
        const inner = createHash("sha256");
        inner.update(await readFile(abs));
        outer.update(rel);
        outer.update("\0");
        outer.update(String(info.size));
        outer.update("\0");
        outer.update(inner.digest("hex"));
        outer.update("\n");
    }
    return `sha256:${outer.digest("hex")}`;
}

export async function hashPluginFolder(folderPath: string): Promise<string> {
    const signature = await pluginFolderSignature(folderPath);
    const cached = hashCache.get(folderPath);
    if (cached && cached.signature === signature) {
        return cached.hash;
    }
    const hash = await hashListed(folderPath, signature);
    hashCache.set(folderPath, {signature, hash});
    return hash;
}

export function hashesEqual(left: string | null | undefined, right: string | null | undefined): boolean {
    if (!left || !right) {
        return false;
    }
    return left === right;
}
