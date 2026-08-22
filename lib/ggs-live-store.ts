import path from "node:path";
import {readFile} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import {growcastDataDir} from "@/lib/data-paths";
import {GGS_PLUGIN_ID, type GgsLiveIngest, parseIngestBody} from "@/lib/ggs-live";

export function ggsLiveFile(): string {
    return path.join(growcastDataDir(), "mesh", `${GGS_PLUGIN_ID}.json`);
}

export async function readGgsLive(): Promise<GgsLiveIngest | null> {
    try {
        const raw = JSON.parse(await readFile(ggsLiveFile(), "utf8")) as unknown;
        const parsed = parseIngestBody(raw);
        return parsed.ok ? parsed.value : null;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        return null;
    }
}

export async function saveGgsLive(state: GgsLiveIngest): Promise<void> {
    await atomicWriteFile(ggsLiveFile(), JSON.stringify(state, null, 2));
}
