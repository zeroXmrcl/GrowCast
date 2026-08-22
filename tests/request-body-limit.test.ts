import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    DEFAULT_MAX_BODY_BYTES,
    MEDIA_MAX_BODY_BYTES,
    contentLengthExceedsCap,
    maxBodyBytesFor,
} from "../lib/request-body-limit.ts";

describe("maxBodyBytesFor", () => {
    it("allows the large cap only on POST /api/admin/media", () => {
        assert.equal(maxBodyBytesFor("POST", "/api/admin/media"), MEDIA_MAX_BODY_BYTES);
        assert.equal(maxBodyBytesFor("POST", "/api/admin/media/"), MEDIA_MAX_BODY_BYTES);
        assert.equal(maxBodyBytesFor("POST", "/admin"), DEFAULT_MAX_BODY_BYTES);
        assert.equal(maxBodyBytesFor("GET", "/api/admin/media"), DEFAULT_MAX_BODY_BYTES);
    });
});

describe("contentLengthExceedsCap", () => {
    it("flags oversized non-media bodies as 413", () => {
        assert.equal(
            contentLengthExceedsCap(String(DEFAULT_MAX_BODY_BYTES + 1), DEFAULT_MAX_BODY_BYTES),
            true,
        );
        assert.equal(
            contentLengthExceedsCap(String(DEFAULT_MAX_BODY_BYTES), DEFAULT_MAX_BODY_BYTES),
            false,
        );
        assert.equal(
            contentLengthExceedsCap(String(MEDIA_MAX_BODY_BYTES), MEDIA_MAX_BODY_BYTES),
            false,
        );
        assert.equal(contentLengthExceedsCap(null, DEFAULT_MAX_BODY_BYTES), false);
    });
});
