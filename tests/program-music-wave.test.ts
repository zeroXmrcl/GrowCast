import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    DEFAULT_MUSIC_LOOK,
    DEFAULT_WAVE_BARS,
    DEFAULT_WAVE_SMOOTH_PCT,
    WAVE_BARS_MAX,
    WAVE_BARS_MIN,
    WAVE_BARS_STEP,
    WAVE_SMOOTH_MAX,
    WAVE_SMOOTH_MIN,
    WAVE_SMOOTH_STEP,
    foldFrequencyBins,
    nextPlaylistIndex,
    parseMusicLook,
    parseWaveBars,
    parseWaveSmoothPct,
    pickPlaylistStartIndex,
    playlistTrackTitle,
    programAudioMediaErrorAction,
    programMusicWaveActive,
    shouldAttachMediaElementSource,
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

describe("pickPlaylistStartIndex", () => {
    it("picks a random offset into the playlist", () => {
        assert.equal(pickPlaylistStartIndex(0, () => 0.9), 0);
        assert.equal(pickPlaylistStartIndex(1, () => 0.9), 0);
        assert.equal(pickPlaylistStartIndex(4, () => 0), 0);
        assert.equal(pickPlaylistStartIndex(4, () => 0.25), 1);
        assert.equal(pickPlaylistStartIndex(4, () => 0.999), 3);
    });
});

describe("shouldAttachMediaElementSource", () => {
    it("waits until the audio context is running so native playback is not muted", () => {
        assert.equal(shouldAttachMediaElementSource("running"), true);
        assert.equal(shouldAttachMediaElementSource("suspended"), false);
        assert.equal(shouldAttachMediaElementSource("closed"), false);
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

describe("parseMusicLook", () => {
    it("defaults to player and only accepts wave or player", () => {
        assert.equal(DEFAULT_MUSIC_LOOK, "player");
        assert.equal(parseMusicLook(undefined), "player");
        assert.equal(parseMusicLook("wave"), "wave");
        assert.equal(parseMusicLook("player"), "player");
        assert.equal(parseMusicLook("eq"), "player");
        assert.equal(parseMusicLook(""), "player");
    });
});

describe("parseWaveBars", () => {
    it("defaults to 24, snaps to 4, clamps 8–48", () => {
        assert.equal(DEFAULT_WAVE_BARS, 24);
        assert.equal(WAVE_BARS_MIN, 8);
        assert.equal(WAVE_BARS_MAX, 48);
        assert.equal(WAVE_BARS_STEP, 4);
        assert.equal(parseWaveBars(undefined), 24);
        assert.equal(parseWaveBars(null), 24);
        assert.equal(parseWaveBars("wide"), 24);
        assert.equal(parseWaveBars(25), 24);
        assert.equal(parseWaveBars(7), 8);
        assert.equal(parseWaveBars(99), 48);
        assert.equal(parseWaveBars("32"), 32);
    });
});

describe("foldFrequencyBins", () => {
    it("puts left-heavy energy in the middle with symmetric wings", () => {
        const bins = new Uint8Array(16);
        bins[0] = 255;
        bins[1] = 200;
        bins[2] = 40;
        const out = foldFrequencyBins(bins, 8);
        assert.equal(out.length, 8);
        assert.ok(out[3] >= out[0]);
        assert.ok(out[4] >= out[7]);
        assert.equal(out[0], out[7]);
        assert.equal(out[1], out[6]);
        assert.deepEqual(foldFrequencyBins(new Uint8Array(), 8), [0, 0, 0, 0, 0, 0, 0, 0]);
    });
});

describe("playlistTrackTitle", () => {
    it("strips path, extension, and a leading track number", () => {
        assert.equal(playlistTrackTitle("01. Ambrosia Cascade.m4a"), "Ambrosia Cascade");
        assert.equal(playlistTrackTitle("12 - Bed.mp3"), "Bed");
        assert.equal(playlistTrackTitle("bed.ogg"), "bed");
        assert.equal(playlistTrackTitle("folder/01. Track.wav"), "Track");
        assert.equal(playlistTrackTitle("../x.mp3"), "x");
        assert.equal(playlistTrackTitle(""), "");
    });
});
