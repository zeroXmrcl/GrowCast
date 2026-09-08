import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    COVER_FADE_MS,
    COVER_MIN_MS,
    coverShouldHide,
    hlsPlaylistUrl,
} from "../lib/overlay-hls.ts";

describe("hlsPlaylistUrl", () => {
    it("appends index.m3u8 to a MediaMTX page URL", () => {
        assert.equal(
            hlsPlaylistUrl("http://mtx:8888/growcam/"),
            "http://mtx:8888/growcam/index.m3u8",
        );
        assert.equal(
            hlsPlaylistUrl("http://mtx:8888/growcam"),
            "http://mtx:8888/growcam/index.m3u8",
        );
    });

    it("keeps an existing playlist path", () => {
        assert.equal(
            hlsPlaylistUrl("https://cam.example/live/index.m3u8"),
            "https://cam.example/live/index.m3u8",
        );
        assert.equal(
            hlsPlaylistUrl("https://cam.example/live/master.M3U8?token=a"),
            "https://cam.example/live/master.M3U8?token=a",
        );
    });

    it("returns empty for missing or unsafe URLs", () => {
        assert.equal(hlsPlaylistUrl(""), "");
        assert.equal(hlsPlaylistUrl("javascript:alert(1)"), "");
        assert.equal(hlsPlaylistUrl("not-a-url"), "");
    });
});

describe("coverShouldHide", () => {
    it("stays up while fatal, including the 3s floor after recover", () => {
        assert.equal(COVER_MIN_MS, 3000);
        assert.equal(COVER_FADE_MS, 400);
        assert.equal(
            coverShouldHide({fatal: true, playing: false, shownAtMs: 1000, nowMs: 1000}),
            false,
        );
        assert.equal(
            coverShouldHide({fatal: true, playing: true, shownAtMs: 1000, nowMs: 9000}),
            false,
        );
        assert.equal(
            coverShouldHide({fatal: false, playing: true, shownAtMs: 1000, nowMs: 2999}),
            false,
        );
        assert.equal(
            coverShouldHide({fatal: false, playing: true, shownAtMs: 1000, nowMs: 4000}),
            true,
        );
    });

    it("does not show a cover before the first failure", () => {
        assert.equal(
            coverShouldHide({fatal: false, playing: false, shownAtMs: null, nowMs: 0}),
            true,
        );
        assert.equal(
            coverShouldHide({fatal: false, playing: true, shownAtMs: null, nowMs: 500}),
            true,
        );
    });

    it("holds the cover if video is not playing yet after a show", () => {
        assert.equal(
            coverShouldHide({fatal: false, playing: false, shownAtMs: 1000, nowMs: 9000}),
            false,
        );
    });
});
