import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {fileURLToPath} from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function write(file: string, body: string): void {
    mkdirSync(path.dirname(file), {recursive: true});
    writeFileSync(file, body);
}

describe("plugin UI build source alias", () => {
    it("compiles @/plugins/<folder> from GROWCAST_PLUGINS_DIR, not cwd/plugins", () => {
        const root = mkdtempSync(path.join(tmpdir(), "gc-plugin-alias-"));
        try {
            const cwdPlugins = path.join(root, "plugins", "aliasdemo");
            const stagedPlugins = path.join(root, "staged");
            const stagedFolder = path.join(stagedPlugins, "aliasdemo");

            write(path.join(root, "lib", "marker.ts"), 'export const FROM_CORE = "from-core-lib";\n');
            write(path.join(cwdPlugins, "plugin.json"), '{"id":"growcast.aliasdemo","name":"cwd","version":"0.0.0","apiVersion":"1","permissions":{"network":"none"}}\n');
            write(path.join(cwdPlugins, "ui", "src", "index.tsx"), 'export {LABEL} from "@/plugins/aliasdemo/ui/label";\n');
            write(path.join(cwdPlugins, "ui", "label.ts"), 'export const LABEL = "from-cwd-plugins";\n');

            write(path.join(stagedFolder, "plugin.json"), '{"id":"growcast.aliasdemo","name":"staged","version":"0.0.0","apiVersion":"1","permissions":{"network":"none"}}\n');
            write(
                path.join(stagedFolder, "ui", "src", "index.tsx"),
                'export {LABEL} from "@/plugins/aliasdemo/ui/label";\nexport {FROM_CORE} from "@/lib/marker";\n',
            );
            write(path.join(stagedFolder, "ui", "label.ts"), 'export const LABEL = "from-staged-plugins";\n');

            const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build-plugin-ui.mjs")], {
                cwd: root,
                env: {...process.env, GROWCAST_PLUGINS_DIR: stagedPlugins},
                encoding: "utf8",
            });
            assert.equal(result.status, 0, result.stderr || result.stdout);
            const bundle = readFileSync(path.join(stagedFolder, "ui", "dist", "index.js"), "utf8");
            assert.match(bundle, /from-staged-plugins/);
            assert.match(bundle, /from-core-lib/);
            assert.doesNotMatch(bundle, /from-cwd-plugins/);
        } finally {
            rmSync(root, {recursive: true, force: true});
        }
    });
});
