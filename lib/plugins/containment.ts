import {realpathSync} from "node:fs";
import path from "node:path";

function realOrNull(target: string): string | null {
    try {
        return realpathSync(target);
    } catch {
        return null;
    }
}

/** Manifest paths are relative to the plugin folder. `../` and absolute paths are rejected before any filesystem lookup. */
export function lexicalPluginRelative(spec: string): string | null {
    if (typeof spec !== "string") {
        return null;
    }
    const trimmed = spec.trim();
    if (!trimmed || trimmed.includes("\0")) {
        return null;
    }
    const normalized = path.posix.normalize(trimmed.replace(/\\/g, "/"));
    if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
        return null;
    }
    return normalized;
}

/**
 * Resolve `spec` against `root` and follow symlinks.
 * Returns a path inside the plugin directory, or null when the target leaves it.
 */
export function containedPluginPath(root: string, spec: string): string | null {
    const relative = lexicalPluginRelative(spec);
    if (!relative) {
        return null;
    }
    const rootReal = realOrNull(root);
    if (!rootReal) {
        return null;
    }
    const candidate = path.resolve(rootReal, relative);
    const pending: string[] = [];
    let cursor = candidate;
    let real: string | null = null;
    while (true) {
        real = realOrNull(cursor);
        if (real) {
            break;
        }
        const parent = path.dirname(cursor);
        if (parent === cursor) {
            return null;
        }
        pending.push(path.basename(cursor));
        cursor = parent;
    }
    const ancestorRel = path.relative(rootReal, real);
    if (ancestorRel.startsWith("..") || path.isAbsolute(ancestorRel)) {
        return null;
    }
    const resolved = pending.length === 0 ? real : path.join(/*turbopackIgnore: true*/ real, ...pending.reverse());
    const resolvedRel = path.relative(rootReal, resolved);
    if (resolvedRel.startsWith("..") || path.isAbsolute(resolvedRel)) {
        return null;
    }
    return resolved;
}
