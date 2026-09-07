import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    MUSIC_EXTENSIONS,
    MUSIC_MAX_BYTES,
    MUSIC_MAX_FILES,
    listMusicFiles,
    saveMusicFile,
} from "../lib/restream/music-files.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-music-"));
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

describe("saveMusicFile", () => {
    it("accepts mp3 under cap and rejects traversal and extra files", async () => {
        await withTempDataDir(async () => {
            const ok = await saveMusicFile("loop.mp3", Buffer.from("ID3"));
            assert.equal(ok.ok, true);
            assert.deepEqual(await listMusicFiles(), ["loop.mp3"]);
            const bad = await saveMusicFile("../x.mp3", Buffer.from("ID3"));
            assert.equal(bad.ok, false);
            if (!bad.ok) {
                assert.equal(bad.error, "invalid_name");
            }
            const huge = await saveMusicFile("big.mp3", Buffer.alloc(MUSIC_MAX_BYTES + 1));
            assert.equal(huge.ok, false);
            if (!huge.ok) {
                assert.equal(huge.error, "too_large");
            }
        });
    });

    it("lists in filename order", async () => {
        await withTempDataDir(async () => {
            await saveMusicFile("b.ogg", Buffer.from("OggS"));
            await saveMusicFile("a.wav", Buffer.from("RIFF"));
            assert.deepEqual(await listMusicFiles(), ["a.wav", "b.ogg"]);
        });
    });

    it("rejects the 31st file as too_many", async () => {
        await withTempDataDir(async () => {
            for (let i = 0; i < MUSIC_MAX_FILES; i++) {
                const name = `t${String(i).padStart(2, "0")}.mp3`;
                const result = await saveMusicFile(name, Buffer.from("ID3"));
                assert.equal(result.ok, true);
            }
            const extra = await saveMusicFile("overflow.mp3", Buffer.from("ID3"));
            assert.equal(extra.ok, false);
            if (!extra.ok) {
                assert.equal(extra.error, "too_many");
            }
            assert.equal((await listMusicFiles()).length, MUSIC_MAX_FILES);
        });
    });
});

describe("MUSIC_EXTENSIONS", () => {
    it("allows mp3 ogg wav m4a only", () => {
        assert.equal(MUSIC_EXTENSIONS.has(".mp3"), true);
        assert.equal(MUSIC_EXTENSIONS.has(".flac"), false);
        assert.equal(MUSIC_MAX_FILES, 30);
    });
});
