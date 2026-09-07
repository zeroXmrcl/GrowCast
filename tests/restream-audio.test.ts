import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    EMPTY_RESTREAM_AUDIO,
    parseRestreamAudio,
    readRestreamAudio,
    resolveAudioSource,
    writeRestreamAudio,
} from "../lib/restream/audio.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-audio-"));
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

describe("parseRestreamAudio", () => {
    it("defaults missing audio to paused silence", () => {
        assert.deepEqual(parseRestreamAudio(null), EMPTY_RESTREAM_AUDIO);
        assert.equal(parseRestreamAudio({url: "https://x.example/a.mp3", volume: 0.5, paused: false}).url, "https://x.example/a.mp3");
        assert.equal(parseRestreamAudio({volume: 9}).volume, 1);
        assert.equal(parseRestreamAudio({volume: -1}).volume, 0);
    });
});

describe("resolveAudioSource", () => {
    it("prefers a non-empty URL over the playlist", () => {
        assert.equal(
            resolveAudioSource({url: "https://radio.example/stream", volume: 1, paused: false}, ["a.mp3"]),
            "url",
        );
        assert.equal(
            resolveAudioSource({url: "", volume: 1, paused: false}, ["b.ogg"]),
            "playlist",
        );
        assert.equal(
            resolveAudioSource({url: "   ", volume: 1, paused: false}, []),
            "silence",
        );
    });
});

describe("readRestreamAudio", () => {
    it("round-trips audio.json off grow JSON", async () => {
        await withTempDataDir(async (dir) => {
            await writeRestreamAudio({url: "", volume: 0.62, paused: true});
            const audio = await readRestreamAudio();
            assert.equal(audio.volume, 0.62);
            assert.equal(audio.paused, true);
            assert.equal(dir.includes("current-grow"), false);
        });
    });

    it("clamps volume and stores paused for the mixer", async () => {
        await withTempDataDir(async () => {
            await writeRestreamAudio({url: "", volume: 0.2, paused: true});
            const audio = await readRestreamAudio();
            assert.equal(audio.paused, true);
            assert.equal(audio.volume, 0.2);
        });
    });
});
