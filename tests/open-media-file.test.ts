import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm, symlink, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    MAX_PUBLIC_IMAGE_BYTES,
    openFixedMediaFile,
    openMediaFile,
    parseByteRange,
    streamMediaFile,
} from "../lib/open-media-file.ts";
import {IMAGE_EXTENSIONS, VIDEO_EXTENSIONS} from "../lib/safe-media-filename.ts";

describe("openMediaFile", () => {
    it("serves a regular image and rejects traversal and unsafe names", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "growcast-media-"));
        try {
            await writeFile(path.join(root, "shot.webp"), "webp-bytes");
            const ok = await openMediaFile(root, "shot.webp", IMAGE_EXTENSIONS);
            assert.equal(ok.ok, true);
            if (ok.ok) {
                assert.equal(ok.contentType, "image/webp");
                assert.equal(ok.buffer.toString(), "webp-bytes");
            }

            const traversal = await openMediaFile(root, "../shot.webp", IMAGE_EXTENSIONS);
            assert.equal(traversal.ok, false);
            if (!traversal.ok) {
                assert.equal(traversal.status, 400);
            }

            const txt = await openMediaFile(root, "notes.txt", IMAGE_EXTENSIONS);
            assert.equal(txt.ok, false);
            if (!txt.ok) {
                assert.equal(txt.status, 400);
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    it("does not follow a symlink out of the media root", async (t) => {
        const root = await mkdtemp(path.join(os.tmpdir(), "growcast-media-link-"));
        try {
            const outside = path.join(root, "outside");
            const media = path.join(root, "media");
            await mkdir(outside);
            await mkdir(media);
            await writeFile(path.join(outside, "secret.webp"), "secret");
            try {
                await symlink(path.join(outside, "secret.webp"), path.join(media, "secret.webp"));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "EPERM") {
                    t.skip("host cannot create symlinks");
                    return;
                }
                throw error;
            }

            const opened = await openMediaFile(media, "secret.webp", IMAGE_EXTENSIONS);
            assert.equal(opened.ok, false);
            if (!opened.ok) {
                assert.equal(opened.status, 404);
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });
});

describe("openFixedMediaFile", () => {
    it("refuses a symlink timelapse path", async (t) => {
        const root = await mkdtemp(path.join(os.tmpdir(), "growcast-tl-"));
        try {
            const real = path.join(root, "real.mp4");
            const link = path.join(root, "latest_timelapse.mp4");
            await writeFile(real, "video");
            try {
                await symlink(real, link);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "EPERM") {
                    t.skip("host cannot create symlinks");
                    return;
                }
                throw error;
            }
            const opened = await openFixedMediaFile(link, VIDEO_EXTENSIONS);
            assert.equal(opened.ok, false);
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    it("does not read an oversized image into the heap", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "growcast-media-huge-"));
        try {
            const huge = path.join(root, "shot.webp");
            await writeFile(huge, Buffer.alloc(MAX_PUBLIC_IMAGE_BYTES + 1));
            const opened = await openMediaFile(root, "shot.webp", IMAGE_EXTENSIONS);
            assert.equal(opened.ok, false);
            if (!opened.ok) {
                assert.equal(opened.status, 404);
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    it("streams a byte range instead of the whole video", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "growcast-media-range-"));
        try {
            await writeFile(path.join(root, "clip.mp4"), "abcdefghij");
            assert.deepEqual(parseByteRange("bytes=2-5", 10), {start: 2, end: 5});
            const response = await streamMediaFile(
                root,
                "clip.mp4",
                new Request("http://growcast/clip.mp4", {headers: {range: "bytes=2-5"}}),
                VIDEO_EXTENSIONS,
                "no-store",
            );
            assert.equal(response.status, 206);
            assert.equal(await response.text(), "cdef");
            assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });
});
