#!/usr/bin/env node
/**
 * Fail when a standalone Next build dropped the entry shims plugin host
 * bundles import at runtime. The image copies `.next/standalone`.
 */
import {existsSync, readFileSync, statSync} from "node:fs";
import path from "node:path";

const root = process.cwd();
const names = ["headers.js", "navigation.js", "cache.js"];
const missing = [];

for (const name of names) {
    const file = path.join(root, ".next", "standalone", "node_modules", "next", name);
    if (!existsSync(file) || statSync(file).size === 0) {
        missing.push(file);
        continue;
    }
    const text = readFileSync(file, "utf8");
    if (!text.includes("next/dist") && !text.includes("module.exports") && !text.includes("export")) {
        missing.push(`${file} (unreadable shim)`);
    }
}

if (missing.length > 0) {
    console.error("Next entry shims missing from the standalone build:");
    for (const file of missing) {
        console.error(`  ${file}`);
    }
    console.error("Build with BUILD_STANDALONE=1 so next.config.ts traces node_modules/next/{headers,navigation,cache}.js.");
    process.exit(1);
}

console.log("standalone Next entry shims present: " + names.join(", "));
