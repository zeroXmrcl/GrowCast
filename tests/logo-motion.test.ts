import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {logoCrossfadeAllowed} from "../lib/logo-motion.ts";

describe("header logo motion", () => {
    it("keeps a static GrowCast title when reduced motion is requested", () => {
        assert.equal(logoCrossfadeAllowed(true), false);
        assert.equal(logoCrossfadeAllowed(false), true);
    });
});
