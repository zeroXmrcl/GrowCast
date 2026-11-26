import {cp, mkdir, mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {_resetDiscoveryCacheForTests} from "../lib/plugins/discovery.ts";
import {_resetHostModuleCacheForTests} from "../lib/plugins/first-party.ts";
import {enablePlugin} from "../lib/plugins/registry.ts";

const fixtureHost = fileURLToPath(new URL("./fixtures/ggs-host/index.ts", import.meta.url));

const manifest = {
    id: "growcast.ggs",
    name: "GrowCast GGS fixture",
    author: "0xmrcl",
    version: "0.0.0",
    apiVersion: 1,
    ui: {entry: "ui/dist/index.js", sdk: "^1.0.0"},
    hostModule: "host/index.ts",
    permissions: {network: "none", publicPages: true},
    compat: {meshSettings: true, meshState: true},
    config: {},
    metrics: {},
};

let fixtureRoot: string | null = null;
let previousPlugins: string | undefined;
let pluginsOverridden = false;

async function ensureFixture(): Promise<string> {
    if (fixtureRoot) {
        return fixtureRoot;
    }
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-ggs-fixture-"));
    const plugin = path.join(root, "ggs");
    await mkdir(path.join(plugin, "host"), {recursive: true});
    await mkdir(path.join(plugin, "ui", "dist"), {recursive: true});
    await cp(fixtureHost, path.join(plugin, "host", "index.ts"));
    const {writeFile} = await import("node:fs/promises");
    await writeFile(path.join(plugin, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(plugin, "ui", "dist", "index.js"), "export default {}\n");
    fixtureRoot = root;
    return root;
}

export async function enableGgsForTests(): Promise<void> {
    if (!pluginsOverridden) {
        previousPlugins = process.env.GROWCAST_PLUGINS_DIR;
        pluginsOverridden = true;
    }
    process.env.GROWCAST_PLUGINS_DIR = await ensureFixture();
    _resetDiscoveryCacheForTests();
    _resetHostModuleCacheForTests();
    await enablePlugin("growcast.ggs");
}

export function restoreGgsPluginsDirForTests(): void {
    if (!pluginsOverridden) {
        return;
    }
    if (previousPlugins === undefined) {
        delete process.env.GROWCAST_PLUGINS_DIR;
    } else {
        process.env.GROWCAST_PLUGINS_DIR = previousPlugins;
    }
    pluginsOverridden = false;
    _resetDiscoveryCacheForTests();
    _resetHostModuleCacheForTests();
}
