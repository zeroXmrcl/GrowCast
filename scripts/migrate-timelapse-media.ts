/**
 * Copy legacy timelapse stills and latest_timelapse.mp4 into the plugin data
 * directory. Default is a dry run. --apply copies. It never moves or deletes.
 *
 *   npx tsx scripts/migrate-timelapse-media.ts --install-root . --data-dir ./data
 *   npx tsx scripts/migrate-timelapse-media.ts --install-root . --data-dir ./data --apply
 */
import {copyFile, mkdir, readdir, stat} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";

const IMAGE = /\.(webp|jpe?g|png)$/i;
const VIDEO = /\.mp4$/i;

export type MediaCopy = {
    from: string;
    to: string;
    bytes: number;
};

function argValue(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    return process.argv[index + 1];
}

async function listFiles(dir: string, pattern: RegExp): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(dir, {withFileTypes: true});
    } catch {
        return [];
    }
    return entries
        .filter((entry) => entry.isFile() && pattern.test(entry.name) && !entry.name.toLowerCase().includes(".partial"))
        .map((entry) => path.join(dir, entry.name));
}

export async function planTimelapseMediaMigration(installRoot: string, dataDir: string): Promise<MediaCopy[]> {
    const root = path.resolve(installRoot);
    const destSnapshots = path.join(dataDir, "plugins", "growcast.timelapse", "snapshots");
    const destVideo = path.join(dataDir, "plugins", "growcast.timelapse", "timelapse");
    const snapshotDirs = [
        path.join(root, "extensions", "GrowCast-Timelapse", "snapshots"),
        path.join(root, "plugins", "timelapse", "snapshots"),
        path.join(root, "plugins", "timelapse", "GrowCast-Timelapse", "snapshots"),
    ];
    const videoDirs = [
        path.join(root, "timelapse"),
        path.join(root, "extensions", "GrowCast-Timelapse", "timelapse"),
        path.join(root, "plugins", "timelapse", "timelapse"),
        path.join(root, "plugins", "timelapse", "GrowCast-Timelapse", "timelapse"),
    ];
    const planned: MediaCopy[] = [];
    const seenDest = new Set<string>();
    async function add(from: string, to: string): Promise<void> {
        if (seenDest.has(to)) {
            return;
        }
        let fromStat;
        try {
            fromStat = await stat(from);
        } catch {
            return;
        }
        if (!fromStat.isFile() || fromStat.size <= 0) {
            return;
        }
        try {
            const destStat = await stat(to);
            if (destStat.isFile() && destStat.size === fromStat.size) {
                return;
            }
        } catch {
            /* destination missing */
        }
        seenDest.add(to);
        planned.push({from, to, bytes: fromStat.size});
    }
    for (const dir of snapshotDirs) {
        for (const file of await listFiles(dir, IMAGE)) {
            await add(file, path.join(destSnapshots, path.basename(file)));
        }
    }
    for (const dir of videoDirs) {
        for (const file of await listFiles(dir, VIDEO)) {
            await add(file, path.join(destVideo, path.basename(file)));
        }
    }
    const looseVideo = path.join(root, "timelapse", "latest_timelapse.mp4");
    await add(looseVideo, path.join(destVideo, "latest_timelapse.mp4"));
    return planned;
}

export async function applyTimelapseMediaMigration(copies: MediaCopy[]): Promise<void> {
    for (const copy of copies) {
        await mkdir(path.dirname(copy.to), {recursive: true});
        await copyFile(copy.from, copy.to);
    }
}

async function main(): Promise<void> {
    const apply = process.argv.includes("--apply");
    const installRoot = path.resolve(argValue("--install-root") ?? process.cwd());
    const dataDir = path.resolve(argValue("--data-dir") ?? process.env.GROWCAST_DATA_DIR ?? path.join(process.cwd(), "data"));
    const copies = await planTimelapseMediaMigration(installRoot, dataDir);
    if (copies.length === 0) {
        console.log("No timelapse media to copy.");
        return;
    }
    console.log(`${apply ? "Copying" : "Would copy"} ${copies.length} file(s):`);
    for (const copy of copies) {
        console.log(`${copy.from} -> ${copy.to} (${copy.bytes} bytes)`);
    }
    if (!apply) {
        console.log("Dry run. Re-run with --apply to copy. Originals stay in place.");
        return;
    }
    await applyTimelapseMediaMigration(copies);
    console.log(`Copied ${copies.length} file(s). Originals were not removed.`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : "timelapse media migration failed");
        process.exit(1);
    });
}
