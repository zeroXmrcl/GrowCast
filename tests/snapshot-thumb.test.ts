import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import sharp from "sharp";
import {
    openSnapshotThumb,
    snapshotThumbFilename,
    snapshotThumbSrc,
} from "../lib/snapshot-thumb.ts";

describe("snapshot thumbs", () => {
    it("builds a thumb url without changing the original link", () => {
        assert.equal(
            snapshotThumbSrc("/api/snapshots/0033.webp"),
            "/api/snapshots/0033.webp?thumb=1",
        );
        assert.equal(
            snapshotThumbSrc("/api/archives/grow-1/snapshots/0033.webp"),
            "/api/archives/grow-1/snapshots/0033.webp?thumb=1",
        );
        assert.equal(snapshotThumbFilename("0033.webp"), "0033.webp");
        assert.equal(snapshotThumbFilename("still.png"), "still.webp");
    });

    it("stores a 640 px webp once and serves that file again", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-thumb-"));
        try {
            const source = await sharp({
                create: {width: 1280, height: 720, channels: 3, background: {r: 20, g: 40, b: 10}},
            })
                .webp()
                .toBuffer();
            await writeFile(path.join(dir, "0033.webp"), source);

            const first = await openSnapshotThumb(dir, "0033.webp");
            assert.equal(first.ok, true);
            if (!first.ok) {
                return;
            }
            const meta = await sharp(first.buffer).metadata();
            assert.equal(meta.format, "webp");
            assert.equal(meta.width, 640);

            const thumbPath = path.join(dir, "thumbs", "0033.webp");
            await writeFile(thumbPath, Buffer.from("sentinel-thumb"));
            const second = await openSnapshotThumb(dir, "0033.webp");
            assert.equal(second.ok, true);
            if (!second.ok) {
                return;
            }
            assert.equal(second.buffer.toString(), "sentinel-thumb");
            assert.equal(await readFile(thumbPath, "utf8"), "sentinel-thumb");
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });

    it("rejects a parent-directory filename", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-thumb-"));
        try {
            await mkdir(dir, {recursive: true});
            const opened = await openSnapshotThumb(dir, "../0033.webp");
            assert.equal(opened.ok, false);
            if (opened.ok) {
                return;
            }
            assert.equal(opened.status, 400);
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });
});
