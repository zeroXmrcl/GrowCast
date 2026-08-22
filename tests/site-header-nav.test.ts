import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {navItemsFor} from "../lib/site-nav.ts";

describe("navItemsFor", () => {
    it("hides the current section and appends Settings last when enabled", () => {
        assert.deepEqual(
            navItemsFor("/gallery", true).map((item) => item.href),
            ["/", "/grows", "/admin"],
        );
    });

    it("omits Settings when the flag is off", () => {
        assert.deepEqual(
            navItemsFor("/gallery", false).map((item) => item.href),
            ["/", "/grows"],
        );
    });

    it("does not append Settings on admin routes", () => {
        assert.deepEqual(
            navItemsFor("/admin/archives", true).map((item) => item.href),
            ["/", "/gallery", "/grows"],
        );
    });
});
