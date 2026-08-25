import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    DEFAULT_MAX_BODY_BYTES,
    MEDIA_MAX_BODY_BYTES,
    contentLengthExceedsCap,
    isBodyMethod,
    maxBodyBytesFor,
    payloadTooLargeResponse,
} from "../lib/request-body-limit.ts";
import {
    MAX_UPLOAD_FILE_BYTES,
    MAX_UPLOAD_FILES,
    MULTIPART_OVERHEAD_BYTES,
} from "../lib/media-library.ts";
import {readFileSync} from "node:fs";

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
        assert.equal(contentLengthExceedsCap("0", DEFAULT_MAX_BODY_BYTES), false);
    });

    it("rejects missing or invalid Content-Length instead of treating them as under-cap", () => {
        assert.equal(contentLengthExceedsCap(null, DEFAULT_MAX_BODY_BYTES), true);
        assert.equal(contentLengthExceedsCap(undefined, DEFAULT_MAX_BODY_BYTES), true);
        assert.equal(contentLengthExceedsCap("", DEFAULT_MAX_BODY_BYTES), true);
        assert.equal(contentLengthExceedsCap("  ", DEFAULT_MAX_BODY_BYTES), true);
        assert.equal(contentLengthExceedsCap("1e9", DEFAULT_MAX_BODY_BYTES), true);
        assert.equal(contentLengthExceedsCap("-1", DEFAULT_MAX_BODY_BYTES), true);
        assert.equal(contentLengthExceedsCap("12abc", DEFAULT_MAX_BODY_BYTES), true);
        assert.equal(isBodyMethod("POST"), true);
        assert.equal(isBodyMethod("GET"), false);
    });
});

describe("next proxy body clone vs media route", () => {
    it("keeps the global clone at 1mb and excludes admin media from the proxy matcher", () => {
        const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
        const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
        assert.match(nextConfig, /proxyClientMaxBodySize:\s*"1mb"/);
        assert.match(proxy, /api\/admin\/media/);
        assert.match(proxy, /isBodyMethod/);
    });
});

describe("admin media upload vs proxy cap", () => {
    it("fits files × size plus multipart overhead under MEDIA_MAX_BODY_BYTES", () => {
        assert.ok(
            MAX_UPLOAD_FILES * MAX_UPLOAD_FILE_BYTES + MULTIPART_OVERHEAD_BYTES
                <= MEDIA_MAX_BODY_BYTES,
        );
    });

    it("maps a media POST 413 to an admin notice 303, not a raw body", async () => {
        const response = payloadTooLargeResponse("POST", "/api/admin/media");
        assert.equal(response.status, 303);
        assert.equal(response.headers.get("location"), "/admin?notice=media_payload_too_large");
        assert.equal(await response.text(), "");

        const other = payloadTooLargeResponse("POST", "/api/mesh/growcast.ggs/state");
        assert.equal(other.status, 413);
        assert.equal(await other.text(), "Payload Too Large");
    });
});
