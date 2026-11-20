import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {describe, it} from "node:test";
import {promisify} from "node:util";
import {generatePluginsCompose} from "../../lib/plugins/compose.ts";
import {discoverPlugins} from "../../lib/plugins/discovery.ts";
import {pluginSiteNavItems} from "../../lib/plugins/nav.ts";
import {listRegistryRecords} from "../../lib/plugins/registry.ts";
import {resolvePluginPage, widgetsForSlot} from "../../lib/plugins/routes.ts";
import {withPluginHarness} from "./helpers.ts";

const execFileAsync = promisify(execFile);

describe("empty plugins registry", {concurrency: 1}, () => {
    it("boots with only README.md and zero plugins", async () => {
        await withPluginHarness(async ({pluginsDir}) => {
            await writeFile(path.join(pluginsDir, "README.md"), "# plugins/\n");
            const discovered = await discoverPlugins();
            assert.deepEqual(discovered.plugins, []);
            assert.deepEqual(discovered.issues, []);
            const records = await listRegistryRecords();
            assert.deepEqual(records, []);
            const yaml = await generatePluginsCompose();
            assert.match(yaml, /services: \{\}/);
            assert.equal(await resolvePluginPage("solar", [], "site"), null);
            assert.deepEqual(await widgetsForSlot("dashboard"), []);
            assert.deepEqual(await pluginSiteNavItems(), []);
        });
    });

    it("treats a missing plugins directory as zero plugins", async () => {
        await withPluginHarness(async ({pluginsDir}) => {
            await rm(pluginsDir, {recursive: true, force: true});
            const discovered = await discoverPlugins();
            assert.deepEqual(discovered.plugins, []);
            assert.deepEqual(discovered.issues, []);
            assert.deepEqual(await listRegistryRecords(), []);
        });
    });

    it("plugin UI and host build scripts succeed with zero plugins", async () => {
        await withPluginHarness(async ({pluginsDir}) => {
            await writeFile(path.join(pluginsDir, "README.md"), "# plugins/\n");
            const env = {...process.env, GROWCAST_PLUGINS_DIR: pluginsDir};
            const ui = await execFileAsync("node", ["scripts/build-plugin-ui.mjs"], {cwd: process.cwd(), env});
            assert.match(ui.stdout, /0 plugin/);
            const host = await execFileAsync("node", ["scripts/build-plugin-host.mjs"], {cwd: process.cwd(), env});
            assert.match(host.stdout, /0 plugin/);
        });
    });

    it("does not treat an empty subdirectory without plugin.json as an enabled plugin", async () => {
        await withPluginHarness(async ({pluginsDir}) => {
            await writeFile(path.join(pluginsDir, "README.md"), "# plugins/\n");
            await mkdir(path.join(pluginsDir, "stray"), {recursive: true});
            const discovered = await discoverPlugins();
            assert.deepEqual(discovered.plugins, []);
            assert.equal(discovered.issues.length, 1);
            assert.equal(discovered.issues[0]?.folderName, "stray");
            const records = await listRegistryRecords();
            assert.equal(records.length, 1);
            assert.equal(records[0]?.status, "invalid");
        });
    });
});
