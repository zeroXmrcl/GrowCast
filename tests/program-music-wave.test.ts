import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    DEFAULT_WAVE_SMOOTH_PCT,
    WAVE_SMOOTH_MAX,
    WAVE_SMOOTH_MIN,
    WAVE_SMOOTH_STEP,
    nextPlaylistIndex,
    parseWaveSmoothPct,
    programAudioMediaErrorAction,
    programMusicWaveActive,
    waveSmoothTimeConstant,
} from "../lib/program-music-wave.ts";

describe("programMusicWaveActive", () => {
    it("is true only while a local playlist file is playing", () => {
        assert.equal(
            programMusicWaveActive({kind: "playlist", paused: false, src: "/api/overlay/music/a.mp3"}),
            true,
        );
        assert.equal(
            programMusicWaveActive({kind: "playlist", paused: true, src: "/api/overlay/music/a.mp3"}),
            false,
        );
        assert.equal(
            programMusicWaveActive({kind: "playlist", paused: false, src: ""}),
            false,
        );
        assert.equal(
            programMusicWaveActive({kind: "url", paused: false, src: "https://radio.example/stream"}),
            false,
        );
        assert.equal(
            programMusicWaveActive({kind: "silence", paused: false, src: ""}),
            false,
        );
    });
});

describe("parseWaveSmoothPct", () => {
    it("defaults to 70, snaps to 5, clamps 0–100", () => {
        assert.equal(DEFAULT_WAVE_SMOOTH_PCT, 70);
        assert.equal(WAVE_SMOOTH_MIN, 0);
        assert.equal(WAVE_SMOOTH_MAX, 100);
        assert.equal(WAVE_SMOOTH_STEP, 5);
        assert.equal(parseWaveSmoothPct(undefined), 70);
        assert.equal(parseWaveSmoothPct(null), 70);
        assert.equal(parseWaveSmoothPct(""), 70);
        assert.equal(parseWaveSmoothPct("wide"), 70);
        assert.equal(parseWaveSmoothPct(77), 75);
        assert.equal(parseWaveSmoothPct(-1), 0);
        assert.equal(parseWaveSmoothPct(999), 100);
        assert.equal(parseWaveSmoothPct(70), 70);
    });
});

describe("nextPlaylistIndex", () => {
    it("advances and wraps to the start after the last track", () => {
        assert.equal(nextPlaylistIndex(0, 3), 1);
        assert.equal(nextPlaylistIndex(1, 3), 2);
        assert.equal(nextPlaylistIndex(2, 3), 0);
        assert.equal(nextPlaylistIndex(0, 1), 0);
        assert.equal(nextPlaylistIndex(0, 0), 0);
    });
});

describe("programAudioMediaErrorAction", () => {
    it("does not latch a playlist into silence", () => {
        assert.equal(
            programAudioMediaErrorAction({kind: "playlist", filesLength: 3, retries: 0}),
            "retry",
        );
        assert.equal(
            programAudioMediaErrorAction({kind: "playlist", filesLength: 3, retries: 1}),
            "next",
        );
        assert.equal(
            programAudioMediaErrorAction({kind: "playlist", filesLength: 1, retries: 4}),
            "retry",
        );
        assert.equal(
            programAudioMediaErrorAction({kind: "url", filesLength: 2, retries: 0}),
            "url_fallback",
        );
        assert.equal(
            programAudioMediaErrorAction({kind: "url", filesLength: 0, retries: 0}),
            "silence",
        );
        assert.equal(
            programAudioMediaErrorAction({kind: "silence", filesLength: 0, retries: 0}),
            "silence",
        );
    });
});

describe("waveSmoothTimeConstant", () => {
    it("maps percent to analyser smoothing and never reaches 1", () => {
        assert.equal(waveSmoothTimeConstant(70), 0.7);
        assert.equal(waveSmoothTimeConstant(0), 0);
        assert.equal(waveSmoothTimeConstant(100), 0.95);
    });
});
