import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {applyTimelapseMediaMigration, planTimelapseMediaMigration} from "../scripts/migrate-timelapse-media.ts";

describe("timelapse media migration", () => {
    it("plans a copy of legacy stills and latest_timelapse.mp4 and does not copy until apply", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "growcast-tl-src-"));
        const data = await mkdtemp(path.join(os.tmpdir(), "growcast-tl-data-"));
        try {
            const shots = path.join(root, "extensions", "GrowCast-Timelapse", "snapshots");
            const videoDir = path.join(root, "timelapse");
            await mkdir(shots, {recursive: true});
            await mkdir(videoDir, {recursive: true});
            await writeFile(path.join(shots, "1001.webp"), "still-a");
            await writeFile(path.join(shots, "ignore.txt"), "nope");
            await writeFile(path.join(videoDir, "latest_timelapse.mp4"), "video-bytes");
            await writeFile(path.join(videoDir, "latest_timelapse.mp4.partial"), "partial");
            const planned = await planTimelapseMediaMigration(root, data);
            assert.equal(planned.length, 2);
            assert.equal(planned.some((copy) => copy.to.endsWith(`${path.sep}snapshots${path.sep}1001.webp`)), true);
            assert.equal(planned.some((copy) => copy.to.endsWith(`${path.sep}timelapse${path.sep}latest_timelapse.mp4`)), true);
            await assert.rejects(stat(path.join(data, "plugins", "growcast.timelapse", "snapshots", "1001.webp")));
            await applyTimelapseMediaMigration(planned);
            assert.equal(await readFile(path.join(data, "plugins", "growcast.timelapse", "snapshots", "1001.webp"), "utf8"), "still-a");
            assert.equal(await readFile(path.join(shots, "1001.webp"), "utf8"), "still-a");
            assert.equal(await readFile(path.join(data, "plugins", "growcast.timelapse", "timelapse", "latest_timelapse.mp4"), "utf8"), "video-bytes");
            const again = await planTimelapseMediaMigration(root, data);
            assert.equal(again.length, 0);
        } finally {
            await rm(root, {recursive: true, force: true});
            await rm(data, {recursive: true, force: true});
        }
    });
});
