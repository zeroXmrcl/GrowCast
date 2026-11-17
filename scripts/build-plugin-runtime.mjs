import {mkdirSync, existsSync} from "node:fs";
import path from "node:path";

const outdir = path.join(process.cwd(), "public", "plugin-runtime");
mkdirSync(outdir, {recursive: true});

let build;
try {
    ({build} = await import("esbuild"));
} catch (error) {
    if (existsSync(path.join(outdir, "react.js"))) {
        console.log("esbuild not installed; keeping existing public/plugin-runtime");
        process.exit(0);
    }
    throw error;
}

const shared = {
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
};

await build({
    ...shared,
    entryPoints: ["react"],
    outfile: path.join(outdir, "react.js"),
});
await build({
    ...shared,
    entryPoints: ["react/jsx-runtime"],
    outfile: path.join(outdir, "jsx-runtime.js"),
});
await build({
    ...shared,
    entryPoints: ["react-dom"],
    outfile: path.join(outdir, "react-dom.js"),
});
await build({
    ...shared,
    entryPoints: ["react-dom/client"],
    outfile: path.join(outdir, "react-dom-client.js"),
});
await build({
    ...shared,
    entryPoints: [path.join(process.cwd(), "packages/plugin-sdk/src/ui/index.ts")],
    outfile: path.join(outdir, "plugin-sdk-ui.js"),
    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
    jsx: "automatic",
});

console.log("plugin runtime written to public/plugin-runtime");
