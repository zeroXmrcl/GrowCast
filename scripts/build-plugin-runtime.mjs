import {mkdirSync, existsSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

const outdir = path.join(process.cwd(), "public", "plugin-runtime");
mkdirSync(outdir, {recursive: true});

let esbuild;
try {
    esbuild = await import("esbuild");
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
    define: {"process.env.NODE_ENV": '"production"'},
};

const entries = path.join(process.cwd(), "scripts", "plugin-runtime-entries");

await esbuild.build({
    ...shared,
    entryPoints: [path.join(entries, "react.mjs")],
    outfile: path.join(outdir, "react.js"),
});

async function bundleWithSharedReact(npmEntry, bundleName, named) {
    const bundleFile = path.join(outdir, bundleName);
    await esbuild.build({
        ...shared,
        minify: false,
        entryPoints: [npmEntry],
        outfile: bundleFile,
        external: ["react"],
        logLevel: "warning",
    });
    let js = readFileSync(bundleFile, "utf8");
    js = js.replaceAll('__require("react")', "__gcReact").replaceAll("__require('react')", "__gcReact");
    if (js.includes("__gcReact")) {
        js = `import __gcReact from "react";\n${js}`;
    }
    const minified = await esbuild.transform(js, {minify: true, target: "es2022", format: "esm", loader: "js"});
    writeFileSync(bundleFile, minified.code);
    const wrapper = [
        `import runtime from ${JSON.stringify("./" + bundleName)};`,
        "export default runtime;",
        ...named.map((name) => `export const ${name} = runtime.${name};`),
        "",
    ].join("\n");
    return wrapper;
}

writeFileSync(
    path.join(outdir, "jsx-runtime.js"),
    await bundleWithSharedReact("react/jsx-runtime", "jsx-runtime.bundle.js", ["Fragment", "jsx", "jsxs"]),
);
writeFileSync(
    path.join(outdir, "react-dom.js"),
    await bundleWithSharedReact("react-dom", "react-dom.bundle.js", ["createPortal", "flushSync", "version"]),
);
writeFileSync(
    path.join(outdir, "react-dom-client.js"),
    await bundleWithSharedReact("react-dom/client", "react-dom-client.bundle.js", ["createRoot", "hydrateRoot", "version"]),
);

await esbuild.build({
    ...shared,
    entryPoints: [path.join(process.cwd(), "packages/plugin-sdk/src/ui/index.ts")],
    outfile: path.join(outdir, "plugin-sdk-ui.js"),
    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
    jsx: "automatic",
});

console.log("plugin runtime written to public/plugin-runtime");
