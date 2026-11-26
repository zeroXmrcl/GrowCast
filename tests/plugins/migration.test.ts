import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {applyPluginDataMigration, migrationTreesMatch, planPluginDataMigration} from "../../scripts/migrate-plugin-data.ts";

async function withFixture<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-migrate-"));
    try {
        await mkdir(path.join(dir, "energy", "current"), {recursive: true});
        await mkdir(path.join(dir, "climate", "current"), {recursive: true});
        await mkdir(path.join(dir, "mesh"), {recursive: true});
        await mkdir(path.join(dir, "restream"), {recursive: true});
        await writeFile(path.join(dir, "energy", "current", "2026-11-16.json"), "{\"date\":\"2026-11-16\",\"hours\":{}}\n");
        await writeFile(path.join(dir, "climate", "current", "2026-11-16.json"), "{\"date\":\"2026-11-16\",\"points\":[]}\n");
        await writeFile(path.join(dir, "mesh", "growcast.ggs.json"), "{\"pluginId\":\"growcast.ggs\"}\n");
        await writeFile(path.join(dir, "ggs.env"), "SF_EMAIL=test@example.com\n");
        await writeFile(path.join(dir, "mesh", "growcast.timelapse.json"), "{\"paused\":false}\n");
        await writeFile(path.join(dir, "timelapse.env"), "RTSP_STREAM=rtsp://cam\n");
        await writeFile(path.join(dir, "restream", "control.json"), "{\"enabled\":false}\n");
        return await fn(dir);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
}

describe("plugin data migration", () => {
    it("plans copies from core storage into data/plugins/<id>", async () => {
        await withFixture(async (dir) => {
            const steps = planPluginDataMigration(dir);
            assert.equal(steps.some((step) => step.to.endsWith("plugins/growcast.ggs/energy")), true);
            assert.equal(steps.some((step) => step.to.endsWith("plugins/growcast.restream")), true);
            assert.equal(steps.every((step) => step.from.startsWith(dir)), true);
        });
    });

    it("dry-run copies nothing", async () => {
        await withFixture(async (dir) => {
            const result = await applyPluginDataMigration({dataDir: dir, dryRun: true});
            assert.ok(result.copied.length >= 5);
            assert.equal(existsSync(path.join(dir, "plugins", "growcast.ggs", "energy")), false);
        });
    });

    it("apply is idempotent, preserves energy day files, and does not delete legacy trees", async () => {
        await withFixture(async (dir) => {
            const first = await applyPluginDataMigration({dataDir: dir, dryRun: false});
            assert.ok(first.copied.length >= 5);
            const energy = await readFile(
                path.join(dir, "plugins", "growcast.ggs", "energy", "current", "2026-11-16.json"),
                "utf8",
            );
            assert.match(energy, /2026-11-16/);
            const live = await readFile(path.join(dir, "plugins", "growcast.ggs", "live.json"), "utf8");
            assert.match(live, /growcast.ggs/);
            const restream = await readFile(path.join(dir, "plugins", "growcast.restream", "control.json"), "utf8");
            assert.match(restream, /enabled/);
            assert.equal(existsSync(path.join(dir, "energy", "current", "2026-11-16.json")), true);
            const second = await applyPluginDataMigration({dataDir: dir, dryRun: false});
            assert.equal(second.copied.length, 0);
            assert.ok(second.skipped.length >= 5);
        });
    });

    it("does not keep a half-copied directory marked done", async () => {
        await withFixture(async (dir) => {
            const dest = path.join(dir, "plugins", "growcast.ggs", "energy");
            await mkdir(path.join(dest, "current"), {recursive: true});
            await writeFile(path.join(dest, "current", "partial.json"), "{}\n");
            await writeFile(path.join(dest, ".migrated"), "done\n");
            await applyPluginDataMigration({dataDir: dir, dryRun: false});
            assert.equal(
                await migrationTreesMatch(path.join(dir, "energy"), dest),
                true,
            );
            const marker = await readFile(path.join(dest, ".migrated"), "utf8");
            assert.notEqual(marker, "done\n");
            assert.equal(existsSync(path.join(dest, "current", "2026-11-16.json")), true);
        });
    });
});
