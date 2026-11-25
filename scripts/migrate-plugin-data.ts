#!/usr/bin/env node
/**
 * Copy legacy core sidecar storage into data/plugins/<id>/.
 * Idempotent. Default is dry-run. Never talks to a remote/prod host.
 * Does not enable plugins and does not delete legacy folders.
 *
 *   npx tsx scripts/migrate-plugin-data.ts --dry-run
 *   npx tsx scripts/migrate-plugin-data.ts --apply
 */
import {createHash, randomBytes} from "node:crypto";
import {copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";

export type MigrateOptions = {
    dataDir: string;
    dryRun: boolean;
};

export type MigrateStep = {
    from: string;
    to: string;
    kind: "dir" | "file";
};

export function planPluginDataMigration(dataDir: string): MigrateStep[] {
    const steps: MigrateStep[] = [
        {kind: "dir", from: path.join(dataDir, "energy"), to: path.join(dataDir, "plugins", "growcast.ggs", "energy")},
        {kind: "dir", from: path.join(dataDir, "climate"), to: path.join(dataDir, "plugins", "growcast.ggs", "climate")},
        {
            kind: "file",
            from: path.join(dataDir, "mesh", "growcast.ggs.json"),
            to: path.join(dataDir, "plugins", "growcast.ggs", "live.json"),
        },
        {
            kind: "file",
            from: path.join(dataDir, "ggs.env"),
            to: path.join(dataDir, "plugins", "growcast.ggs", "ggs.env"),
        },
        {
            kind: "file",
            from: path.join(dataDir, "mesh", "growcast.timelapse.json"),
            to: path.join(dataDir, "plugins", "growcast.timelapse", "settings.json"),
        },
        {
            kind: "file",
            from: path.join(dataDir, "timelapse.env"),
            to: path.join(dataDir, "plugins", "growcast.timelapse", "timelapse.env"),
        },
        {
            kind: "dir",
            from: path.join(dataDir, "restream"),
            to: path.join(dataDir, "plugins", "growcast.restream"),
        },
    ];
    return steps;
}

const MIGRATED_MARKER = ".migrated";

async function fileDigest(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    hash.update(await readFile(filePath));
    return hash.digest("hex");
}

async function treeDigest(root: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    async function walk(relative: string): Promise<void> {
        const dir = relative ? path.join(root, relative) : root;
        const entries = await readdir(dir, {withFileTypes: true});
        for (const entry of entries) {
            if (entry.name === MIGRATED_MARKER) {
                continue;
            }
            const rel = relative ? `${relative}/${entry.name}` : entry.name;
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(rel);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            out.set(rel, await fileDigest(abs));
        }
    }
    await walk("");
    return out;
}

export async function migrationTreesMatch(source: string, destination: string): Promise<boolean> {
    let sourceInfo;
    let destinationInfo;
    try {
        sourceInfo = await stat(source);
        destinationInfo = await stat(destination);
    } catch {
        return false;
    }
    if (!sourceInfo.isDirectory() || !destinationInfo.isDirectory()) {
        if (sourceInfo.isFile() && destinationInfo.isFile()) {
            return await fileDigest(source) === await fileDigest(destination);
        }
        return false;
    }
    const left = await treeDigest(source);
    const right = await treeDigest(destination);
    if (left.size !== right.size) {
        return false;
    }
    for (const [rel, digest] of left) {
        if (right.get(rel) !== digest) {
            return false;
        }
    }
    return true;
}

async function markMigrated(destination: string): Promise<void> {
    await writeFile(path.join(destination, MIGRATED_MARKER), `${new Date().toISOString()}\n`);
}

async function copyVerified(step: MigrateStep): Promise<void> {
    const token = randomBytes(8).toString("hex");
    const temporary = `${step.to}.migrate-${token}`;
    await rm(temporary, {recursive: true, force: true});
    await mkdir(path.dirname(temporary), {recursive: true});
    try {
        if (step.kind === "dir") {
            await cp(step.from, temporary, {recursive: true, force: false, errorOnExist: true});
        } else {
            await copyFile(step.from, temporary);
        }
        if (!await migrationTreesMatch(step.from, temporary)) {
            throw new Error(`migration verify failed for ${step.from}`);
        }
        if (existsSync(step.to)) {
            const backup = `${step.to}.incomplete-${token}`;
            await rename(step.to, backup);
            try {
                await rename(temporary, step.to);
            } catch (error) {
                await rename(backup, step.to).catch(() => undefined);
                throw error;
            }
            await rm(backup, {recursive: true, force: true});
        } else {
            await rename(temporary, step.to);
        }
        if (step.kind === "dir") {
            if (!await migrationTreesMatch(step.from, step.to)) {
                throw new Error(`migration verify failed after rename for ${step.from}`);
            }
            await markMigrated(step.to);
        }
    } finally {
        await rm(temporary, {recursive: true, force: true});
    }
}

export async function applyPluginDataMigration(
    options: MigrateOptions,
): Promise<{copied: string[]; skipped: string[]}> {
    const copied: string[] = [];
    const skipped: string[] = [];
    for (const step of planPluginDataMigration(options.dataDir)) {
        if (!existsSync(step.from)) {
            skipped.push(`${step.from} (missing)`);
            continue;
        }
        if (existsSync(step.to)) {
            if (await migrationTreesMatch(step.from, step.to)) {
                skipped.push(`${step.to} (already complete)`);
                if (!options.dryRun && step.kind === "dir" && !existsSync(path.join(step.to, MIGRATED_MARKER))) {
                    await markMigrated(step.to);
                }
                continue;
            }
            if (step.kind === "file") {
                skipped.push(`${step.to} (exists and differs)`);
                continue;
            }
        }
        copied.push(`${step.from} -> ${step.to}`);
        if (options.dryRun) {
            continue;
        }
        await copyVerified(step);
    }
    return {copied, skipped};
}

async function main(): Promise<void> {
    const args = new Set(process.argv.slice(2));
    if (args.has("--help") || args.has("-h")) {
        process.stdout.write(`GrowCast plugin data migration
  --dry-run     print the plan (default)
  --apply       copy files
  --data-dir DIR  override data directory
Does not enable plugins. Does not delete legacy folders.
Never run this against production from a laptop; take a backup first.\n`);
        return;
    }
    if (args.has("--enable-first-party")) {
        process.stderr.write("Refused: --enable-first-party was removed. Enable plugins in Admin after cutover.\n");
        process.exitCode = 2;
        return;
    }
    const dryRun = !args.has("--apply");
    const dataDirArg = process.argv.find((item, index, all) => all[index - 1] === "--data-dir");
    const dataDir = dataDirArg
        || process.env.GROWCAST_DATA_DIR?.trim()
        || path.resolve(process.cwd(), "data");
    const result = await applyPluginDataMigration({
        dataDir,
        dryRun,
    });
    process.stdout.write(`${dryRun ? "DRY RUN" : "APPLY"} dataDir=${dataDir}\n`);
    for (const line of result.copied) {
        process.stdout.write(`copy ${line}\n`);
    }
    for (const line of result.skipped) {
        process.stdout.write(`skip ${line}\n`);
    }
    if (!dryRun) {
        process.stdout.write("Enable GGS, Timelapse, Restream, and Solar in Admin → Plugins immediately after start.\n");
        process.stdout.write("Do not delete legacy data folders until the owner says so.\n");
    }
}

const isDirect = process.argv[1]?.includes("migrate-plugin-data");
if (isDirect) {
    void main();
}
