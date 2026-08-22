import assert from "node:assert/strict";
import {mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import sharp from "sharp";
import {
    deleteMediaFile,
    listMediaFiles,
    listMediaUrls,
    mediaCollectionDir,
    MAX_UPLOAD_FILE_BYTES,
    MAX_UPLOAD_FILES,
    saveUploadedImages,
} from "../lib/media-library.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-media-"));
    try {
        return await fn(dir);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
}

function toFile(buffer: Buffer, name: string, type: string): File {
    return new File([new Uint8Array(buffer)], name, {type});
}

async function makeJpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
    let pipeline = sharp({
        create: {width, height, channels: 3, background: {r: 40, g: 120, b: 60}},
    }).jpeg({quality: 90});

    if (orientation !== undefined) {
        pipeline = pipeline.withMetadata({orientation});
    }

    return pipeline.toBuffer();
}

describe("saveUploadedImages", () => {
    it("re-encodes a jpeg to webp, applies orientation, and strips metadata", async () => {
        await withTempDir(async (dir) => {
            // Orientation 6 = rotate 90 degrees; a 200x100 image becomes 100x200.
            const input = await makeJpeg(200, 100, 6);
            const result = await saveUploadedImages(
                "dashboard",
                [toFile(input, "holiday photo.jpg", "image/jpeg")],
                dir,
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.saved.length, 1);
            assert.equal(result.rejected.length, 0);

            const fileName = result.saved[0];
            assert.match(fileName, /^picture-\d{8}-\d{6}-[0-9a-f]{6}\.webp$/);

            const written = await readFile(path.join(dir, fileName));
            const meta = await sharp(written).metadata();
            assert.equal(meta.format, "webp");
            assert.equal(meta.width, 100);
            assert.equal(meta.height, 200);
            assert.equal(meta.exif, undefined);
            assert.equal(meta.orientation, undefined);
        });
    });

    it("caps output dimensions at 2560px without enlarging small images", async () => {
        await withTempDir(async (dir) => {
            const large = await makeJpeg(3000, 1000);
            const small = await makeJpeg(300, 200);

            const result = await saveUploadedImages(
                "setup",
                [
                    toFile(large, "large.jpg", "image/jpeg"),
                    toFile(small, "small.jpg", "image/jpeg"),
                ],
                dir,
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.saved.length, 2);

            const largeMeta = await sharp(
                await readFile(path.join(dir, result.saved[0])),
            ).metadata();
            assert.equal(largeMeta.width, 2560);
            assert.ok((largeMeta.height ?? 0) <= 854);

            const smallMeta = await sharp(
                await readFile(path.join(dir, result.saved[1])),
            ).metadata();
            assert.equal(smallMeta.width, 300);
            assert.equal(smallMeta.height, 200);

            assert.ok(result.saved.every((name) => name.startsWith("setup-")));
        });
    });

    it("rejects files that are not real raster images", async () => {
        await withTempDir(async (dir) => {
            const fakePng = Buffer.from("<script>alert(1)</script> not an image");
            const svg = Buffer.from(
                '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
            );

            const result = await saveUploadedImages(
                "dashboard",
                [
                    toFile(fakePng, "fake.png", "image/png"),
                    toFile(svg, "vector.svg", "image/svg+xml"),
                ],
                dir,
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.saved.length, 0);
            assert.deepEqual(
                result.rejected.map((entry) => entry.reason),
                ["invalid_image", "invalid_image"],
            );
            assert.deepEqual(await readdir(dir), []);
        });
    });

    it("rejects oversized files before decoding", async () => {
        await withTempDir(async (dir) => {
            const oversized = Buffer.alloc(MAX_UPLOAD_FILE_BYTES + 1);
            const result = await saveUploadedImages(
                "dashboard",
                [toFile(oversized, "huge.jpg", "image/jpeg")],
                dir,
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.saved.length, 0);
            assert.deepEqual(result.rejected, [{name: "huge.jpg", reason: "too_large"}]);
        });
    });

    it("enforces the file-count limit and rejects empty uploads", async () => {
        await withTempDir(async (dir) => {
            const tiny = await makeJpeg(10, 10);
            const files = Array.from({length: MAX_UPLOAD_FILES + 1}, (_, i) =>
                toFile(tiny, `img-${i}.jpg`, "image/jpeg"),
            );

            assert.deepEqual(await saveUploadedImages("setup", files, dir), {
                ok: false,
                error: "too_many_files",
            });
            assert.deepEqual(await saveUploadedImages("setup", [], dir), {
                ok: false,
                error: "no_files",
            });
        });
    });
});

describe("deleteMediaFile", () => {
    it("deletes an existing file", async () => {
        await withTempDir(async (dir) => {
            await writeFile(path.join(dir, "IMG_1792.jpeg"), "x");

            const result = await deleteMediaFile("dashboard", "IMG_1792.jpeg", dir);

            assert.deepEqual(result, {ok: true});
            assert.deepEqual(await readdir(dir), []);
        });
    });

    it("rejects traversal attempts, hidden files, and wrong extensions", async () => {
        await withTempDir(async (dir) => {
            await writeFile(path.join(dir, "keep.webp"), "x");

            const attempts = [
                "../escape.webp",
                "..\\escape.webp",
                "a/b.webp",
                "..",
                ".hidden.webp",
                "notes.txt",
                "",
            ];

            for (const name of attempts) {
                const result = await deleteMediaFile("setup", name, dir);
                assert.deepEqual(
                    result,
                    {ok: false, error: "invalid_filename"},
                    `expected rejection for ${JSON.stringify(name)}`,
                );
            }

            assert.deepEqual(await readdir(dir), ["keep.webp"]);
        });
    });

    it("reports missing files cleanly", async () => {
        await withTempDir(async (dir) => {
            const result = await deleteMediaFile("setup", "gone.webp", dir);
            assert.deepEqual(result, {ok: false, error: "not_found"});
        });
    });
});

describe("listMediaFiles", () => {
    it("lists only images, sorted ascending, with encoded collection URLs", async () => {
        await withTempDir(async (dir) => {
            await writeFile(path.join(dir, "b photo.webp"), "x");
            await writeFile(path.join(dir, "a.jpeg"), "x");
            await writeFile(path.join(dir, "notes.txt"), "x");

            const files = await listMediaFiles("dashboard", dir);

            assert.deepEqual(
                files.map((file) => file.name),
                ["a.jpeg", "b photo.webp"],
            );
            assert.equal(files[0].url, "/yourPictures/a.jpeg");
            assert.equal(files[1].url, "/yourPictures/b%20photo.webp");
        });
    });

    it("returns an empty list for a missing directory", async () => {
        const files = await listMediaFiles("setup", "/nonexistent/growcast-media-test");
        assert.deepEqual(files, []);
    });

    it("exposes collection URLs and the canonical dashboard directory", async () => {
        await withTempDir(async (dir) => {
            await writeFile(path.join(dir, "hero.webp"), "x");
            assert.deepEqual(await listMediaUrls("dashboard", dir), ["/yourPictures/hero.webp"]);
        });
        assert.equal(
            mediaCollectionDir("dashboard"),
            path.join(process.cwd(), "public", "yourPictures"),
        );
        assert.equal(mediaCollectionDir("setup"), path.join(process.cwd(), "public", "setup"));
    });
});
