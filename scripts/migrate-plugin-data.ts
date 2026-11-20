#!/usr/bin/env node
/**
 * Copy legacy core sidecar storage into data/plugins/<id>/.
 * Idempotent. Default is dry-run. Never talks to a remote/prod host.
 * Does not enable plugins and does not delete legacy folders.
 *
 *   npx tsx scripts/migrate-plugin-data.ts --dry-run
 *   npx tsx scripts/migrate-plugin-data.ts --apply
 */
import {copyFile, cp, mkdir, writeFile} from "node:fs/promises";
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
        const already = existsSync(step.to);
        if (already) {
            skipped.push(`${step.to} (already exists)`);
            if (!options.dryRun && step.kind === "dir") {
                await writeFile(path.join(step.to, ".migrated"), `${new Date().toISOString()}\n`).catch(() => undefined);
            }
            continue;
        }
        copied.push(`${step.from} -> ${step.to}`);
        if (options.dryRun) {
            continue;
        }
        await mkdir(path.dirname(step.to), {recursive: true});
        if (step.kind === "dir") {
            await cp(step.from, step.to, {recursive: true, force: false, errorOnExist: false});
            await writeFile(path.join(step.to, ".migrated"), `${new Date().toISOString()}\n`);
        } else {
            await copyFile(step.from, step.to);
        }
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
