import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {publicRequestOrigin} from "../lib/request-trust.ts";

function requestAt(url: string, headers: Record<string, string>): Request {
    return new Request(url, {method: "POST", headers});
}

describe("publicRequestOrigin", () => {
    it("prefers Host over a listen-address X-Forwarded-Host", () => {
        assert.equal(
            publicRequestOrigin(
                requestAt("http://0.0.0.0:3000/api/admin/media", {
                    origin: "https://tunnel.example",
                    host: "tunnel.example",
                    "x-forwarded-host": "0.0.0.0:3000",
                    "x-forwarded-proto": "https",
                }),
            ),
            "https://tunnel.example",
        );
    });

    it("drops the default https port so Origin comparisons match the browser", () => {
        assert.equal(
            publicRequestOrigin(
                requestAt("http://0.0.0.0:3000/api/admin/media", {
                    host: "tunnel.example:443",
                    "x-forwarded-proto": "https",
                }),
            ),
            "https://tunnel.example",
        );
    });

    it("uses GROWCAST_PUBLIC_URL when set", () => {
        assert.equal(
            publicRequestOrigin(
                requestAt("http://0.0.0.0:3000/api/admin/media", {
                    host: "localhost:3000",
                }),
                {GROWCAST_PUBLIC_URL: "https://grow.example.com"},
            ),
            "https://grow.example.com",
        );
    });
});
