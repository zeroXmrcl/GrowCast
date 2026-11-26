import assert from "node:assert/strict";
import {readdir, readFile, stat} from "node:fs/promises";
import path from "node:path";
import {describe, it} from "node:test";

const ROOT = process.cwd();
const TREES = ["app", "components", "hooks", "lib"];
const PLUGIN_IMPORT = /(?:from\s+|import\s*\()\s*['"]@\/plugins\//;
const PLUGIN_IDS = /growcast\.(ggs|timelapse|restream|solar)/;

async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, {withFileTypes: true});
    const files: string[] = [];
    for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walk(abs));
            continue;
        }
        if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
            files.push(abs);
        }
    }
    return files;
}

function isPluginHost(file: string): boolean {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    return rel.startsWith("lib/plugins/");
}

describe("core isolation from first-party plugins", () => {
    it("does not import @/plugins from app, components, hooks, or lib (including lib/plugins)", async () => {
        const hits: string[] = [];
        for (const tree of TREES) {
            const files = await walk(path.join(ROOT, tree));
            for (const file of files) {
                const text = await readFile(file, "utf8");
                if (PLUGIN_IMPORT.test(text)) {
                    hits.push(path.relative(ROOT, file));
                }
            }
        }
        assert.deepEqual(hits, [], hits.join("\n"));
    });

    it("does not name first-party plugin ids outside lib/plugins", async () => {
        const hits: string[] = [];
        for (const tree of TREES) {
            const files = await walk(path.join(ROOT, tree));
            for (const file of files) {
                if (isPluginHost(file)) {
                    continue;
                }
                const text = await readFile(file, "utf8");
                if (PLUGIN_IDS.test(text)) {
                    hits.push(path.relative(ROOT, file));
                }
            }
        }
        assert.deepEqual(hits, [], hits.join("\n"));
    });

    it("keeps lib/plugins as a real directory", async () => {
        const info = await stat(path.join(ROOT, "lib", "plugins"));
        assert.equal(info.isDirectory(), true);
    });
});
