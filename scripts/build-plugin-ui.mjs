import {chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync} from "node:fs";
import path from "node:path";

const pluginsDir = process.env.GROWCAST_PLUGINS_DIR?.trim()
    ? path.resolve(process.env.GROWCAST_PLUGINS_DIR)
    : path.join(process.cwd(), "plugins");
if (!existsSync(pluginsDir)) {
    console.log("no plugins/ directory; skip plugin UI build");
    process.exit(0);
}

let build;
try {
    ({build} = await import("esbuild"));
} catch (error) {
    const hasDist = readdirSync(pluginsDir).some((folder) => (
        existsSync(path.join(pluginsDir, folder, "ui", "dist", "index.js"))
    ));
    if (hasDist) {
        console.log("esbuild not installed; keeping existing plugins/*/ui/dist");
        process.exit(0);
    }
    throw error;
}

const folders = readdirSync(pluginsDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && existsSync(path.join(pluginsDir, entry.name, "plugin.json")))
    .map((entry) => entry.name);
let built = 0;
for (const folder of folders) {
    const entryTsx = path.join(pluginsDir, folder, "ui", "src", "index.tsx");
    const entryTs = path.join(pluginsDir, folder, "ui", "src", "index.ts");
    const entry = existsSync(entryTsx) ? entryTsx : existsSync(entryTs) ? entryTs : null;
    if (!entry) {
        continue;
    }
    const outdir = path.join(pluginsDir, folder, "ui", "dist");
    mkdirSync(outdir, {recursive: true});
    await build({
        absWorkingDir: process.cwd(),
        entryPoints: [entry],
        outfile: path.join(outdir, "index.js"),
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        jsx: "automatic",
        minify: true,
        logLevel: "warning",
        external: [
            "react",
            "react/jsx-runtime",
            "react-dom",
            "react-dom/client",
            "@growcast/plugin-sdk/ui",
        ],
        alias: {
            "@": process.cwd(),
        },
    });
    const styleSrc = path.join(pluginsDir, folder, "ui", "src", "style.css");
    if (existsSync(styleSrc)) {
        copyFileSync(styleSrc, path.join(outdir, "style.css"));
    }
    makeWorldReadable(outdir);
    built += 1;
}

function makeWorldReadable(target) {
    const info = statSync(target);
    if (info.isDirectory()) {
        chmodSync(target, 0o755);
        for (const name of readdirSync(target)) {
            makeWorldReadable(path.join(target, name));
        }
        return;
    }
    chmodSync(target, 0o644);
}

console.log(`plugin UI written for ${built} plugin(s) under plugins/*/ui/dist`);
