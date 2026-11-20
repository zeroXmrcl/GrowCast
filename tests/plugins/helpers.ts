import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {_resetPluginRateLimitsForTests} from "../../lib/plugins/rate-limit.ts";
import {_resetHostModuleCacheForTests} from "../../lib/plugins/first-party.ts";

export const SAMPLE_MANIFEST = {
    id: "community.example",
    name: "Example",
    author: "0xmrcl",
    version: "0.1.0",
    apiVersion: 1,
    ui: {entry: "ui/dist/index.js", sdk: "^1.0.0"},
    pages: [{id: "home", path: "", title: "Example", nav: "site", public: true}],
    widgets: [{id: "stat", title: "Stat", slots: ["dashboard"], size: "1x1"}],
    permissions: {network: "none", publicPages: true},
    config: {
        intervalS: {type: "integer", min: 5, max: 300, default: 10},
        pvPeakW: {type: "integer", default: 11000},
    },
    metrics: {
        "pv.power": {unit: "W", kind: "gauge", min: 0, max: "config.pvPeakW * 1.3"},
        "pv.energy": {unit: "Wh", kind: "counter"},
        "battery.soc": {unit: "%", kind: "gauge", min: 0, max: 100},
    },
};

let mutex = Promise.resolve();

export function withPluginHarness<T>(fn: (ctx: {
    dataDir: string;
    pluginsDir: string;
    writePlugin: (folder: string, manifest: unknown, extra?: Record<string, string>) => Promise<string>;
}) => Promise<T>): Promise<T> {
    const next = mutex.then(() => withPluginHarnessUnqueued(fn));
    mutex = next.then(() => undefined, () => undefined);
    return next;
}

async function withPluginHarnessUnqueued<T>(fn: (ctx: {
    dataDir: string;
    pluginsDir: string;
    writePlugin: (folder: string, manifest: unknown, extra?: Record<string, string>) => Promise<string>;
}) => Promise<T>): Promise<T> {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "growcast-plugin-data-"));
    const pluginsDir = await mkdtemp(path.join(os.tmpdir(), "growcast-plugin-root-"));
    const previousData = process.env.GROWCAST_DATA_DIR;
    const previousPlugins = process.env.GROWCAST_PLUGINS_DIR;
    const previousRuntime = process.env.GROWCAST_PLUGIN_RUNTIME;
    const previousCompose = process.env.GROWCAST_COMPOSE_DIR;
    process.env.GROWCAST_DATA_DIR = dataDir;
    process.env.GROWCAST_PLUGINS_DIR = pluginsDir;
    process.env.GROWCAST_PLUGIN_RUNTIME = "none";
    process.env.GROWCAST_COMPOSE_DIR = dataDir;
    _resetPluginRateLimitsForTests();
    _resetHostModuleCacheForTests();
    try {
        return await fn({
            dataDir,
            pluginsDir,
            async writePlugin(folder, manifest, extra = {}) {
                const dir = path.join(pluginsDir, folder);
                await mkdir(path.join(dir, "ui/dist"), {recursive: true});
                await writeFile(path.join(dir, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
                await writeFile(path.join(dir, "ui/dist/index.js"), extra["ui/dist/index.js"] ?? "export default {}\n");
                for (const [rel, contents] of Object.entries(extra)) {
                    if (rel === "ui/dist/index.js") {
                        continue;
                    }
                    const abs = path.join(dir, rel);
                    await mkdir(path.dirname(abs), {recursive: true});
                    await writeFile(abs, contents);
                }
                return dir;
            },
        });
    } finally {
        _resetPluginRateLimitsForTests();
        _resetHostModuleCacheForTests();
        if (previousData === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previousData;
        }
        if (previousPlugins === undefined) {
            delete process.env.GROWCAST_PLUGINS_DIR;
        } else {
            process.env.GROWCAST_PLUGINS_DIR = previousPlugins;
        }
        if (previousRuntime === undefined) {
            delete process.env.GROWCAST_PLUGIN_RUNTIME;
        } else {
            process.env.GROWCAST_PLUGIN_RUNTIME = previousRuntime;
        }
        if (previousCompose === undefined) {
            delete process.env.GROWCAST_COMPOSE_DIR;
        } else {
            process.env.GROWCAST_COMPOSE_DIR = previousCompose;
        }
        await rm(dataDir, {recursive: true, force: true});
        await rm(pluginsDir, {recursive: true, force: true});
    }
}
