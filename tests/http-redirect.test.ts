import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {seeOther} from "../lib/http-redirect.ts";

describe("seeOther", () => {
    it("returns a relative Location so the browser stays on the public host", () => {
        const response = seeOther("/admin?notice=uploaded");
        assert.equal(response.status, 303);
        assert.equal(response.headers.get("location"), "/admin?notice=uploaded");
        assert.equal(response.headers.get("location")?.startsWith("/"), true);
        assert.equal(response.headers.get("location")?.includes("://"), false);
    });
});
