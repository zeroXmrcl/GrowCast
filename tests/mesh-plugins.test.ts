import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {GGS_PLUGIN_ID, TIMELAPSE_PLUGIN_ID, isKnownMeshPlugin} from "../lib/mesh-plugins.ts";

describe("mesh plugin registry", () => {
    it("knows timelapse and ggs only", () => {
        assert.equal(TIMELAPSE_PLUGIN_ID, "growcast.timelapse");
        assert.equal(GGS_PLUGIN_ID, "growcast.ggs");
        assert.equal(isKnownMeshPlugin("growcast.timelapse"), true);
        assert.equal(isKnownMeshPlugin("growcast.ggs"), true);
        assert.equal(isKnownMeshPlugin("growcast.nope"), false);
        assert.equal(isKnownMeshPlugin(""), false);
    });
});
