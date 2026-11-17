import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {parsePluginManifest} from "../lib/plugins/manifest.ts";

describe("mesh plugin compat", () => {
    it("declares mesh settings/state on GGS and Timelapse only", () => {
        const ggs = parsePluginManifest(JSON.parse(
            readFileSync(path.join(process.cwd(), "plugins", "ggs", "plugin.json"), "utf8"),
        ) as unknown);
        const timelapse = parsePluginManifest(JSON.parse(
            readFileSync(path.join(process.cwd(), "plugins", "timelapse", "plugin.json"), "utf8"),
        ) as unknown);
        const restream = parsePluginManifest(JSON.parse(
            readFileSync(path.join(process.cwd(), "plugins", "restream", "plugin.json"), "utf8"),
        ) as unknown);
        assert.equal(ggs.ok, true);
        assert.equal(timelapse.ok, true);
        assert.equal(restream.ok, true);
        if (ggs.ok) {
            assert.equal(ggs.value.compat?.meshState, true);
            assert.equal(ggs.value.compat?.meshSettings, true);
        }
        if (timelapse.ok) {
            assert.equal(timelapse.value.compat?.meshSettings, true);
            assert.equal(timelapse.value.compat?.meshState ?? false, false);
        }
        if (restream.ok) {
            assert.equal(restream.value.compat?.meshState ?? false, false);
        }
    });
});
