import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {applyMusicPost} from "../lib/admin/apply-music-post.ts";
import {
    MUSIC_MAX_FILES,
    listMusicFiles,
    saveMusicFile,
} from "../lib/restream/music-files.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-music-post-"));
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

function mp3File(name: string): File {
    return new File([new Uint8Array([0x49, 0x44, 0x33])], name, {type: "audio/mpeg"});
}

describe("applyMusicPost", () => {
    it("uploads a valid small mp3 File so it is listed", async () => {
        await withTempDataDir(async () => {
            const form = new FormData();
            form.set("intent", "upload");
            form.set("file", mp3File("loop.mp3"));

            const result = await applyMusicPost(form);
            assert.equal(result.ok, true);
            if (result.ok) {
                assert.equal(result.notice, "music_uploaded");
            }
            assert.deepEqual(await listMusicFiles(), ["loop.mp3"]);
        });
    });

    it("rejects a traversal filename as invalid_name", async () => {
        await withTempDataDir(async () => {
            const form = new FormData();
            form.set("intent", "upload");
            form.set("file", mp3File("../x.mp3"));

            const result = await applyMusicPost(form);
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.reason, "invalid_name");
                assert.equal(result.notice, "music_invalid_file");
            }
            assert.deepEqual(await listMusicFiles(), []);
        });
    });

    it("rejects the 31st unique file as too_many", async () => {
        await withTempDataDir(async () => {
            for (let i = 0; i < MUSIC_MAX_FILES; i++) {
                const name = `t${String(i).padStart(2, "0")}.mp3`;
                const saved = await saveMusicFile(name, Buffer.from("ID3"));
                assert.equal(saved.ok, true);
            }

            const form = new FormData();
            form.set("intent", "upload");
            form.set("file", mp3File("overflow.mp3"));
            const extra = await applyMusicPost(form);
            assert.equal(extra.ok, false);
            if (!extra.ok) {
                assert.equal(extra.reason, "too_many");
                assert.equal(extra.notice, "music_too_many_files");
            }
            assert.equal((await listMusicFiles()).length, MUSIC_MAX_FILES);
        });
    });

    it("uploads several valid files in one post", async () => {
        await withTempDataDir(async () => {
            const form = new FormData();
            form.set("intent", "upload");
            form.append("file", mp3File("a.mp3"));
            form.append("file", mp3File("b.mp3"));
            form.append("file", mp3File("c.mp3"));

            const result = await applyMusicPost(form);
            assert.equal(result.ok, true);
            if (result.ok && result.notice !== "music_deleted") {
                assert.equal(result.notice, "music_uploaded");
                assert.equal(result.saved, 3);
            }
            assert.deepEqual(await listMusicFiles(), ["a.mp3", "b.mp3", "c.mp3"]);
        });
    });

    it("saves what fits and reports partial when the library is full", async () => {
        await withTempDataDir(async () => {
            for (let i = 0; i < MUSIC_MAX_FILES - 1; i++) {
                const name = `t${String(i).padStart(2, "0")}.mp3`;
                const saved = await saveMusicFile(name, Buffer.from("ID3"));
                assert.equal(saved.ok, true);
            }

            const form = new FormData();
            form.set("intent", "upload");
            form.append("file", mp3File("keep.mp3"));
            form.append("file", mp3File("overflow.mp3"));
            const result = await applyMusicPost(form);
            assert.equal(result.ok, true);
            if (result.ok && result.notice === "music_uploaded_partial") {
                assert.equal(result.saved, 1);
                assert.equal(result.rejected, 1);
            } else {
                assert.equal(result.notice, "music_uploaded_partial");
            }
            const names = await listMusicFiles();
            assert.equal(names.length, MUSIC_MAX_FILES);
            assert.equal(names.includes("keep.mp3"), true);
            assert.equal(names.includes("overflow.mp3"), false);
        });
    });

    it("deletes a listed file", async () => {
        await withTempDataDir(async () => {
            const upload = new FormData();
            upload.set("intent", "upload");
            upload.set("file", mp3File("loop.mp3"));
            assert.equal((await applyMusicPost(upload)).ok, true);
            assert.deepEqual(await listMusicFiles(), ["loop.mp3"]);

            const del = new FormData();
            del.set("intent", "delete");
            del.set("filename", "loop.mp3");
            const result = await applyMusicPost(del);
            assert.equal(result.ok, true);
            if (result.ok) {
                assert.equal(result.notice, "music_deleted");
            }
            assert.deepEqual(await listMusicFiles(), []);
        });
    });
});

describe("admin music route", () => {
    it("mirrors media CSRF, auth, and body-cap on POST /api/admin/music", () => {
        const src = readFileSync(
            path.join(process.cwd(), "app", "api", "admin", "music", "route.ts"),
            "utf8",
        );
        assert.match(src, /isSameOriginRequest/);
        assert.match(src, /isAdminAuthenticated/);
        assert.match(src, /contentLengthExceedsCap/);
        assert.match(src, /payloadTooLargeResponse/);
        assert.match(src, /applyMusicPost/);
        assert.match(src, /\/admin\/stream/);
        assert.match(src, /error=unauthorized/);
        assert.doesNotMatch(src, /isSameOriginRequest[\s\S]*\/\/ skip/);
    });
});
