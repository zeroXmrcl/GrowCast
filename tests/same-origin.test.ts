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

    it("allows a public Origin when request.url is the 0.0.0.0 listen address", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("http://0.0.0.0:3000/api/admin/media", {
                    origin: "https://tunnel.example",
                    host: "tunnel.example",
                    "x-forwarded-host": "tunnel.example",
                    "x-forwarded-proto": "https",
                }),
            ),
            true,
        );
    });

    it("denies a foreign Origin even when Host matches the tunnel", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("http://0.0.0.0:3000/api/admin/media", {
                    origin: "https://evil.example",
                    host: "tunnel.example",
                    "x-forwarded-host": "tunnel.example",
                    "x-forwarded-proto": "https",
                }),
            ),
            false,
        );
    });

    it("allows a tunnel Origin when Host is public and X-Forwarded-Host is the listen address", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("http://0.0.0.0:3000/api/admin/media", {
                    origin: "https://tunnel.example",
                    host: "tunnel.example",
                    "x-forwarded-host": "0.0.0.0:3000",
                    "x-forwarded-proto": "https",
                }),
            ),
            true,
        );
    });

    it("allows Sec-Fetch-Site same-origin even if reconstructed request.url is the listen address", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("http://0.0.0.0:3000/api/admin/media", {
                    origin: "https://tunnel.example",
                    host: "localhost:3000",
                    "sec-fetch-site": "same-origin",
                }),
            ),
            true,
        );
    });

    it("denies Sec-Fetch-Site cross-site even when Origin matches Host", () => {
        assert.equal(
            isSameOriginRequest(
                requestAt("https://grow.0xmarcel.com/api/admin/media", {
                    origin: "https://grow.0xmarcel.com",
                    host: "grow.0xmarcel.com",
                    "sec-fetch-site": "cross-site",
                }),
            ),
            false,
        );
    });
});

