import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {parsePluginManifest} from "../../lib/plugins/manifest.ts";
import {SAMPLE_MANIFEST} from "./helpers.ts";

describe("plugin manifest", () => {
    it("accepts a marketplace-ready first-party-shaped manifest", () => {
        const parsed = parsePluginManifest(SAMPLE_MANIFEST);
        assert.equal(parsed.ok, true);
        if (parsed.ok) {
            assert.equal(parsed.value.id, "community.example");
            assert.equal(parsed.value.apiVersion, 1);
            assert.equal(parsed.value.ui?.sdk, "^1.0.0");
        }
    });

    it("rejects a reserved growcast.* id that is not first-party", () => {
        const parsed = parsePluginManifest({...SAMPLE_MANIFEST, id: "growcast.unknown"});
        assert.equal(parsed.ok, false);
    });

    it("accepts first-party growcast.solar", () => {
        const parsed = parsePluginManifest({...SAMPLE_MANIFEST, id: "growcast.solar"});
        assert.equal(parsed.ok, true);
    });

    it("rejects a public page without publicPages permission", () => {
        const parsed = parsePluginManifest({
            ...SAMPLE_MANIFEST,
            permissions: {network: "none"},
        });
        assert.equal(parsed.ok, false);
    });

    it("rejects an unknown metric unit", () => {
        const parsed = parsePluginManifest({
            ...SAMPLE_MANIFEST,
            metrics: {"pv.power": {unit: "horsepower", kind: "gauge"}},
        });
        assert.equal(parsed.ok, false);
    });

    it("rejects the wrong SDK major", () => {
        const parsed = parsePluginManifest({
            ...SAMPLE_MANIFEST,
            ui: {entry: "ui/dist/index.js", sdk: "^2.0.0"},
        });
        assert.equal(parsed.ok, false);
    });
});
