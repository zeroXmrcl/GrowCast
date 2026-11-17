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

export async function hashPluginFolder(folderPath: string): Promise<string> {
    const files = (await listFiles(folderPath)).sort((a, b) => a.localeCompare(b));
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

export function hashesEqual(left: string | null | undefined, right: string | null | undefined): boolean {
    if (!left || !right) {
        return false;
    }
    return left === right;
}
