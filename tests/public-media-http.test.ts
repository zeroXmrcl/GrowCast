import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {publicMediaGetResponse} from "../lib/public-media-http.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-public-media-"));
    try {
        return await fn(dir);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
}

describe("publicMediaGetResponse", () => {
    it("serves a jpeg written after process start from the dashboard collection", async () => {
        await withTempDir(async (dir) => {
            await mkdir(dir, {recursive: true});
            const name = "picture-20260825-100048-79e4c9.jpeg";
            const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x01, 0x02]);
            await writeFile(path.join(dir, name), bytes);

            const response = await publicMediaGetResponse("dashboard", name, dir);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("content-type"), "image/jpeg");
            assert.match(response.headers.get("cache-control") ?? "", /no-store/);
            const body = Buffer.from(await response.arrayBuffer());
            assert.deepEqual(body, bytes);
        });
    });

    it("serves a setup png and 404s unknown files", async () => {
        await withTempDir(async (dir) => {
            await writeFile(path.join(dir, "setup-1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
            const ok = await publicMediaGetResponse("setup", "setup-1.png", dir);
            assert.equal(ok.status, 200);
            assert.equal(ok.headers.get("content-type"), "image/png");

            const missing = await publicMediaGetResponse("dashboard", "picture-missing.webp", dir);
            assert.equal(missing.status, 404);
        });
    });

    it("route handlers call publicMediaGetResponse", async () => {
        const pictures = await readFile(
            new URL("../app/yourPictures/[filename]/route.ts", import.meta.url),
            "utf8",
        );
        const setup = await readFile(
            new URL("../app/setup/[filename]/route.ts", import.meta.url),
            "utf8",
        );
        assert.match(pictures, /publicMediaGetResponse\("dashboard"/);
        assert.match(setup, /publicMediaGetResponse\("setup"/);
    });
});
