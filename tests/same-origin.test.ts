import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {isSameOriginRequest} from "../lib/same-origin.ts";

function requestAt(
    url: string,
    headers: Record<string, string>,
): Request {
    return new Request(url, {method: "POST", headers});
}

describe("isSameOriginRequest", () => {
    it("allows a matching Origin", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("https://grow.0xmarcel.com/api/admin/media", {
                    origin: "https://grow.0xmarcel.com",
                }),
            ),
            true,
        );
    });

    it("rejects a cross-origin Origin", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("https://grow.0xmarcel.com/api/admin/media", {
                    origin: "https://evil.example",
                }),
            ),
            false,
        );
    });

    it("falls back to Referer when Origin is absent", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("https://grow.0xmarcel.com/api/admin/media", {
                    referer: "https://grow.0xmarcel.com/admin",
                }),
            ),
            true,
        );
    });

    it("rejects a missing Origin and Referer", () => {
        assert.equal(
            isSameOriginRequest(requestAt("https://grow.0xmarcel.com/api/admin/media", {})),
            false,
        );
    });
});
