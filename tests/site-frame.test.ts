import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {SITE_FRAME_CLASS} from "../lib/site-frame.ts";

describe("SITE_FRAME_CLASS", () => {
    it("matches Dashboard / header: max-w-7xl with px-4 md:px-8 inside the cap", () => {
        assert.equal(SITE_FRAME_CLASS, "mx-auto w-full max-w-7xl px-4 md:px-8");
    });
});
