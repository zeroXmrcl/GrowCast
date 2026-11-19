import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createElement, type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {after, describe, it} from "node:test";
import {build, type Plugin} from "esbuild";
import type {NavItem} from "../lib/site-nav.ts";

const root = path.resolve(import.meta.dirname, "..");

function aliasPlugin(): Plugin {
    return {
        name: "growcast-test-alias",
        setup(buildApi) {
            buildApi.onResolve({filter: /^@\//}, (args) => {
                const base = path.join(root, args.path.slice(2));
                const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
                const resolved = candidates.find((candidate) => existsSync(candidate));
                if (!resolved) {
                    return undefined;
                }
                return {path: resolved};
            });
        },
    };
}

await mkdir(path.join(root, "node_modules/.cache"), {recursive: true});
const outdir = await mkdtemp(path.join(root, "node_modules/.cache/gc-header-"));
after(async () => {
    await rm(outdir, {recursive: true, force: true});
});

await build({
    entryPoints: [path.join(root, "components/site-header.tsx")],
    bundle: true,
    format: "esm",
    outfile: path.join(outdir, "header.mjs"),
    platform: "node",
    jsx: "automatic",
    plugins: [aliasPlugin()],
    alias: {
        "next/link": path.join(root, "tests/next-link-stub.mjs"),
        "next/image": path.join(root, "tests/next-image-stub.mjs"),
        "next/navigation": path.join(root, "tests/next-navigation-stub.mjs"),
    },
    external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
});

const {default: SiteHeader} = await import(pathToFileURL(path.join(outdir, "header.mjs")).href) as {
    default: (props: {showPastGrows?: boolean; showSettingsLink?: boolean; extra?: NavItem[]}) => ReactNode;
};

const extra: NavItem[] = [
    {href: "/p/ggs/energy", label: "Energy"},
    {href: "/p/solar", label: "Solar"},
    {href: "/p/timelapse/gallery", label: "Gallery"},
];

function renderAt(pathname: string): string {
    (globalThis as {__GROWCAST_TEST_PATHNAME?: string}).__GROWCAST_TEST_PATHNAME = pathname;
    return renderToStaticMarkup(createElement(SiteHeader, {
        showPastGrows: true,
        showSettingsLink: false,
        extra,
    }));
}

function navHrefs(html: string): string[] {
    const nav = html.slice(html.indexOf("<nav"));
    return [...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("SiteHeader on a plugin page", () => {
    it("renders every site plugin link and marks Solar current on /p/solar", () => {
        const html = renderAt("/p/solar");
        assert.deepEqual(navHrefs(html), [
            "/",
            "/p/ggs/energy",
            "/p/solar",
            "/p/timelapse/gallery",
            "/grows",
        ]);
        assert.match(html, /href="\/p\/solar"[^>]*aria-current="page"/);
        assert.match(html, />Solar</);
        assert.doesNotMatch(html, /href="\/p\/ggs\/energy"[^>]*aria-current="page"/);
    });

    it("marks Energy current on /p/ggs/energy and still shows Solar", () => {
        const html = renderAt("/p/ggs/energy");
        assert.ok(navHrefs(html).includes("/p/solar"));
        assert.match(html, /href="\/p\/ggs\/energy"[^>]*aria-current="page"/);
        assert.match(html, /font-semibold/);
    });

    it("keeps Gallery in the header and marks it current on its page", () => {
        const html = renderAt("/p/timelapse/gallery");
        assert.ok(navHrefs(html).includes("/p/timelapse/gallery"));
        assert.match(html, /href="\/p\/timelapse\/gallery"[^>]*aria-current="page"/);
    });
});
