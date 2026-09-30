/**
 * Node test loader: map @/* to project root and retry with .ts extension.
 */
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextHeadersStub = pathToFileURL(path.join(root, "tests/next-headers-stub.mjs")).href;
const nextNavigationStub = pathToFileURL(path.join(root, "tests/next-navigation-stub.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers" || specifier === "next/headers.js") {
        return {url: nextHeadersStub, shortCircuit: true};
    }
    if (specifier === "next/navigation" || specifier === "next/navigation.js") {
        return {url: nextNavigationStub, shortCircuit: true};
    }

    let next = specifier;

    if (next.startsWith("@/")) {
        next = pathToFileURL(path.join(root, next.slice(2))).href;
    }

    try {
        return await nextResolve(next, context);
    } catch (error) {
        const asPath = next.startsWith("file:") ? fileURLToPath(next) : next;
        if (!asPath.endsWith(".ts") && !asPath.endsWith(".tsx") && !asPath.endsWith(".json")) {
            const withTs = next.startsWith("file:")
                ? pathToFileURL(`${asPath}.ts`).href
                : `${next}.ts`;
            try {
                return await nextResolve(withTs, context);
            } catch {
                const withIndex = next.startsWith("file:")
                    ? pathToFileURL(path.join(asPath, "index.ts")).href
                    : `${next}/index.ts`;
                try {
                    return await nextResolve(withIndex, context);
                } catch {
                    // fall through
                }
            }
        }
        throw error;
    }
}
