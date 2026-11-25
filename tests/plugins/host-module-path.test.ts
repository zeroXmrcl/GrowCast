import assert from "node:assert/strict";
import {mkdir, symlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {describe, it} from "node:test";
import {containedPluginPath} from "../../lib/plugins/containment.ts";
import {findDiscoveredPlugin} from "../../lib/plugins/discovery.ts";
import {_resetHostModuleCacheForTests, loadHostModule} from "../../lib/plugins/first-party.ts";
import {SAMPLE_MANIFEST, withPluginHarness} from "./helpers.ts";

const ESCAPE_FLAG = "__growcastHostEscape";

describe("plugin path containment", {concurrency: 1}, () => {
    it("rejects a hostModule that resolves outside the plugin directory", async () => {
        await withPluginHarness(async ({pluginsDir, writePlugin}) => {
            const secret = path.join(pluginsDir, "secret.js");
            await writeFile(secret, `globalThis.${ESCAPE_FLAG} = true;\nexport const escaped = true;\n`);
            delete (globalThis as Record<string, unknown>)[ESCAPE_FLAG];
            await writePlugin("example", {...SAMPLE_MANIFEST, hostModule: "../secret.js"});
            _resetHostModuleCacheForTests();
            const plugin = await findDiscoveredPlugin("community.example");
            assert.ok(plugin);
            assert.equal(containedPluginPath(plugin.folderPath, "../secret.js"), null);
            const loaded = await loadHostModule(plugin);
            assert.equal(loaded, null);
            assert.equal((globalThis as Record<string, unknown>)[ESCAPE_FLAG], undefined);
        });
    });

    it("rejects a host/dist symlink that points outside the plugin directory", async () => {
        await withPluginHarness(async ({pluginsDir, writePlugin}) => {
            const secret = path.join(pluginsDir, "secret.js");
            await writeFile(secret, `globalThis.${ESCAPE_FLAG} = true;\nexport const escaped = true;\n`);
            delete (globalThis as Record<string, unknown>)[ESCAPE_FLAG];
            const dir = await writePlugin("example", SAMPLE_MANIFEST);
            const dist = path.join(dir, "host", "dist", "index.js");
            await mkdir(path.dirname(dist), {recursive: true});
            await symlink(secret, dist);
            _resetHostModuleCacheForTests();
            const plugin = await findDiscoveredPlugin("community.example");
            assert.ok(plugin);
            assert.equal(containedPluginPath(dir, "host/dist/index.js"), null);
            const loaded = await loadHostModule(plugin);
            assert.equal(loaded, null);
            assert.equal((globalThis as Record<string, unknown>)[ESCAPE_FLAG], undefined);
        });
    });

    it("loads a host module that stays inside the plugin directory", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const dir = await writePlugin("example", {...SAMPLE_MANIFEST, hostModule: "host/index.ts"}, {
                "host/index.ts": "export const marker = 7;\n",
            });
            _resetHostModuleCacheForTests();
            const plugin = await findDiscoveredPlugin("community.example");
            assert.ok(plugin);
            assert.equal(containedPluginPath(dir, "host/index.ts")?.endsWith(`${path.sep}host${path.sep}index.ts`), true);
            const loaded = await loadHostModule(plugin, "stamp-a") as {marker?: number} | null;
            assert.equal(loaded?.marker, 7);
            await writeFile(path.join(dir, "host", "index.ts"), "export const marker = 11;\n");
            const cached = await loadHostModule(plugin, "stamp-a") as {marker?: number} | null;
            assert.equal(cached?.marker, 7);
            const fresh = await loadHostModule(plugin, "stamp-b") as {marker?: number} | null;
            assert.equal(fresh?.marker, 11);
        });
    });
});
