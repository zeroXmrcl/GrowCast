import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {captureTokenFromRequest, isProgramAuthorized} from "../lib/restream/program-auth.ts";
import {isRestreamCaptureAuthorized} from "../lib/restream/capture.ts";

describe("isProgramAuthorized", () => {
    it("allows capture token or admin session, denies neither", () => {
        assert.equal(isProgramAuthorized({admin: true, expectedToken: "tok", providedToken: ""}), true);
        assert.equal(
            isProgramAuthorized({
                admin: false,
                expectedToken: "tok",
                providedToken: "tok",
            }),
            isRestreamCaptureAuthorized("tok", "tok"),
        );
        assert.equal(
            isProgramAuthorized({admin: false, expectedToken: "tok", providedToken: "nope"}),
            false,
        );
        assert.equal(
            isProgramAuthorized({admin: false, expectedToken: "", providedToken: "tok"}),
            false,
        );
    });
});

describe("captureTokenFromRequest", () => {
    it("prefers header over query token", () => {
        const request = new Request("https://example.test/api?token=from-query", {
            headers: {"x-growcast-capture": "from-header"},
        });
        assert.equal(captureTokenFromRequest(request), "from-header");
        assert.equal(
            captureTokenFromRequest(new Request("https://example.test/api?token=from-query")),
            "from-query",
        );
        assert.equal(captureTokenFromRequest(new Request("https://example.test/api")), undefined);
    });
});
