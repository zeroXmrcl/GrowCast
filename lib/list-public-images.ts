import {readdir} from "node:fs/promises";
import path from "node:path";
import {IMAGE_EXTENSIONS} from "@/lib/safe-media-filename";

/**
 * List image files under a directory relative to process.cwd() and map to public URL paths.
 */
export async function listPublicImages(
    dirFromCwd: string,
    urlPrefix: string,
): Promise<string[]> {
    const absoluteDir = path.join(/* turbopackIgnore: true */ process.cwd(), dirFromCwd);

    try {
        const entries = await readdir(absoluteDir, {withFileTypes: true});

        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: "base"}))
            .map((name) => `${urlPrefix.replace(/\/$/, "")}/${encodeURIComponent(name)}`);
    } catch {
        return [];
    }
}
