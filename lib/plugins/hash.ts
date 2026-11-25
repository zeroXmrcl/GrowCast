import {createHash} from "node:crypto";
import {readdir, readFile, readlink, realpath, stat} from "node:fs/promises";
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
    "dist-release",
]);

const NEVER_WALK = new Set([".git"]);

const SKIP_FILE_NAMES = new Set([".ds_store", "thumbs.db"]);

const LOADABLE_EXTENSIONS = new Set([
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".py",
    ".pyw",
]);

// host/dist is the bundle production imports. A change there must change this pin.
function shouldSkipDir(name: string): boolean {
    return SKIP_DIR_NAMES.has(name) || name.startsWith(".");
}

function shouldSkipFile(name: string): boolean {
    const lower = name.toLowerCase();
    // GROWCAST-HASH records the pin. It is written after hashing, so it is not an input.
    return SKIP_FILE_NAMES.has(lower) || lower === "growcast-hash" || lower.endsWith(".pyc") || lower.endsWith(".pyo");
}

function isLoadableFile(name: string): boolean {
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf(".");
    return dot >= 0 && LOADABLE_EXTENSIONS.has(lower.slice(dot));
}

type ListedFile = {
    rel: string;
    kind: "file" | "link";
    link?: string;
};

async function walk(
    rootReal: string,
    relative: string,
    seenDirs: Set<string>,
    out: ListedFile[],
    loadableOnly: boolean,
): Promise<void> {
    const dir = relative ? path.join(rootReal, relative) : rootReal;
    let entries;
    try {
        entries = await readdir(dir, {withFileTypes: true});
    } catch {
        return;
    }
    for (const entry of entries) {
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        const abs = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
            let link = "";
            try {
                link = await readlink(abs);
            } catch {
                link = "";
            }
            out.push({rel, kind: "link", link});
            let real = "";
            try {
                real = await realpath(abs);
            } catch {
                continue;
            }
            const relToRoot = path.relative(rootReal, real);
            if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
                continue;
            }
            const info = await stat(real);
            if (!info.isDirectory() || seenDirs.has(real)) {
                continue;
            }
            seenDirs.add(real);
            await walk(rootReal, rel, seenDirs, out, shouldSkipDir(entry.name) || loadableOnly);
            continue;
        }
        if (entry.isDirectory()) {
            if (NEVER_WALK.has(entry.name)) {
                continue;
            }
            if (shouldSkipDir(entry.name)) {
                await walk(rootReal, rel, seenDirs, out, true);
                continue;
            }
            await walk(rootReal, rel, seenDirs, out, loadableOnly);
            continue;
        }
        if (!entry.isFile() || shouldSkipFile(entry.name)) {
            continue;
        }
        if (loadableOnly && !isLoadableFile(entry.name)) {
            continue;
        }
        out.push({rel, kind: "file"});
    }
}

async function listEntries(root: string): Promise<ListedFile[]> {
    let rootReal = root;
    try {
        rootReal = await realpath(root);
    } catch {
        return [];
    }
    const out: ListedFile[] = [];
    await walk(rootReal, "", new Set([rootReal]), out, false);
    out.sort((a, b) => a.rel.localeCompare(b.rel) || a.kind.localeCompare(b.kind));
    return out;
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
    const entries = await listEntries(folderPath);
    const parts: string[] = [];
    for (const entry of entries) {
        const abs = path.join(folderPath, entry.rel);
        if (entry.kind === "link") {
            let stamp = "missing";
            try {
                stamp = stampOf(await stat(abs));
            } catch {
                stamp = "missing";
            }
            parts.push(`link\0${entry.rel}\0${entry.link ?? ""}\0${stamp}`);
            continue;
        }
        const info = await stat(abs);
        parts.push(`file\0${entry.rel}\0${stampOf(info)}`);
    }
    return parts.join("\n");
}

async function hashListed(folderPath: string, signature: string): Promise<string> {
    const lines = signature.length === 0 ? [] : signature.split("\n");
    const outer = createHash("sha256");
    for (const line of lines) {
        const [kind, rel = "", third = "", fourth = ""] = line.split("\0");
        const abs = path.join(folderPath, rel);
        if (kind === "link") {
            outer.update("link");
            outer.update("\0");
            outer.update(rel);
            outer.update("\0");
            outer.update(third);
            outer.update("\0");
            outer.update(fourth);
            outer.update("\n");
            continue;
        }
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
