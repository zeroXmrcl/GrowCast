import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {archiveMediaGetResponse} from "../lib/archive-media-http.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-archive-get-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function cacheControl(response: Response): string {
    return response.headers.get("cache-control") ?? "";
}

describe("archive media GET cache", () => {
    it("does not year-cache a successful archive image", async () => {
        await withTempDataDir(async (dir) => {
            const archiveId = "2026-04-20-cache-probe";
            const mediaDir = path.join(dir, "archives", archiveId, "snapshots");
            await mkdir(mediaDir, {recursive: true});
            await writeFile(path.join(mediaDir, "1000.webp"), "webp-bytes");

            const response = await archiveMediaGetResponse(archiveId, "snapshots", "1000.webp");

            assert.equal(response.status, 200);
            const header = cacheControl(response);
            assert.equal(header.includes("immutable"), false);
            assert.equal(header.includes("31536000"), false);
            assert.match(header, /no-store/);
        });
    });

    it("does not year-cache 400 or 404 responses", async () => {
        const invalid = await archiveMediaGetResponse("not valid", "snapshots", "x");
        assert.equal(invalid.status, 404);
        assert.equal((invalid.headers.get("cache-control") ?? "").includes("31536000"), false);
        assert.equal((invalid.headers.get("cache-control") ?? "").includes("immutable"), false);

        const traversal = await archiveMediaGetResponse("2026-04-20-ok", "snapshots", "../grow.json");
        assert.equal(traversal.status, 400);
        assert.equal((traversal.headers.get("cache-control") ?? "").includes("31536000"), false);
        assert.equal((traversal.headers.get("cache-control") ?? "").includes("immutable"), false);
    });

    it("route handler uses the no-store helper and does not set immutable", async () => {
        const {readFile} = await import("node:fs/promises");
        const src = await readFile(
            new URL("../app/api/archives/[archiveId]/[kind]/[filename]/route.ts", import.meta.url),
            "utf8",
        );
        assert.match(src, /archiveMediaGetResponse/);
        assert.equal(src.includes("immutable"), false);
        assert.equal(src.includes("31536000"), false);
    });
});
