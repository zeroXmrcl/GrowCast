import {existsSync, mkdirSync, readdirSync} from "node:fs";
import path from "node:path";

const pluginsDir = process.env.GROWCAST_PLUGINS_DIR?.trim()
    ? path.resolve(process.env.GROWCAST_PLUGINS_DIR)
    : path.join(process.cwd(), "plugins");
if (!existsSync(pluginsDir)) {
    console.log("no plugins/ directory; skip plugin host build");
    process.exit(0);
}

let build;
try {
    ({build} = await import("esbuild"));
} catch (error) {
    const hasDist = readdirSync(pluginsDir).some((folder) => (
        existsSync(path.join(pluginsDir, folder, "host", "dist", "index.js"))
    ));
    if (hasDist) {
        console.log("esbuild not installed; keeping existing plugins/*/host/dist");
        process.exit(0);
    }
    throw error;
}

const folders = readdirSync(pluginsDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && existsSync(path.join(pluginsDir, entry.name, "plugin.json")))
    .map((entry) => entry.name);
let built = 0;
for (const folder of folders) {
    const entryTs = path.join(pluginsDir, folder, "host", "index.ts");
    const entryJs = path.join(pluginsDir, folder, "host", "index.js");
    const entry = existsSync(entryTs) ? entryTs : existsSync(entryJs) ? entryJs : null;
    if (!entry) {
        continue;
    }
    const outdir = path.join(pluginsDir, folder, "host", "dist");
    mkdirSync(outdir, {recursive: true});
    await build({
        absWorkingDir: process.cwd(),
        entryPoints: [entry],
        outfile: path.join(outdir, "index.js"),
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node20",
        logLevel: "warning",
        packages: "external",
        alias: {
            "@": process.cwd(),
        },
        plugins: [{
            name: "next-esm-ext",
            setup(pluginBuild) {
                pluginBuild.onResolve({filter: /^next\//}, (args) => ({
                    path: args.path.endsWith(".js") ? args.path : `${args.path}.js`,
                    external: true,
                }));
            },
        }],
        banner: {
            js: 'import {createRequire as __gcCreateRequire} from "node:module"; const require = __gcCreateRequire(import.meta.url);',
        },
    });
    built += 1;
}

console.log(`plugin host written for ${built} plugin(s) under plugins/*/host/dist`);
