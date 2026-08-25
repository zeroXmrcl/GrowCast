import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {normalizeGrowRecord} from "../lib/db.ts";
import {
    DEFAULT_OVERLAY_STREAM,
    overlayStreamEmbeds,
    parseOverlayStream,
} from "../lib/overlay-stream.ts";

describe("parseOverlayStream", () => {
    it("defaults missing and junk to transparent", () => {
        assert.equal(DEFAULT_OVERLAY_STREAM, "transparent");
        assert.equal(parseOverlayStream(undefined), "transparent");
        assert.equal(parseOverlayStream(null), "transparent");
        assert.equal(parseOverlayStream(""), "transparent");
        assert.equal(parseOverlayStream("transparent"), "transparent");
        assert.equal(parseOverlayStream("nope"), "transparent");
        assert.equal(parseOverlayStream(1), "transparent");
    });

    it("round-trips include", () => {
        assert.equal(parseOverlayStream("include"), "include");
    });
});

describe("overlayStreamEmbeds", () => {
    const url = "https://stream.0xmarcel.com/growcam/";

    it("does not embed when mode is transparent even if a stream URL is set", () => {
        assert.equal(overlayStreamEmbeds("transparent", url), false);
    });

    it("embeds only when mode is include and the URL is safe http(s)", () => {
        assert.equal(overlayStreamEmbeds("include", url), true);
        assert.equal(overlayStreamEmbeds("include", ""), false);
        assert.equal(overlayStreamEmbeds("include", "javascript:alert(1)"), false);
        assert.equal(overlayStreamEmbeds("include", "  "), false);
    });
});

describe("normalizeGrowRecord overlayStream", () => {
    it("fills missing overlayStream with transparent", () => {
        assert.equal(normalizeGrowRecord({name: "Only Name"}).overlayStream, "transparent");
    });

    it("keeps include and rejects junk", () => {
        assert.equal(
            normalizeGrowRecord({overlayStream: "include"}).overlayStream,
            "include",
        );
        assert.equal(
            normalizeGrowRecord({overlayStream: "iframe"}).overlayStream,
            "transparent",
        );
    });
});
