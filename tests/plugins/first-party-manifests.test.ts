import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {parsePluginManifest} from "../../lib/plugins/manifest.ts";
import {FIRST_PARTY_PLUGIN_IDS} from "../../lib/plugins/ids.ts";

const FOLDERS: Record<string, string> = {
    "growcast.ggs": "ggs",
    "growcast.timelapse": "timelapse",
    "growcast.restream": "restream",
    "growcast.solar": "solar",
};

describe("first-party plugin.json files", () => {
    for (const id of FIRST_PARTY_PLUGIN_IDS) {
        it(`parses ${id}`, () => {
            const folder = FOLDERS[id];
            const raw = JSON.parse(
                readFileSync(path.join(process.cwd(), "plugins", folder, "plugin.json"), "utf8"),
            ) as unknown;
            const parsed = parsePluginManifest(raw);
            assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
            if (parsed.ok) {
                assert.equal(parsed.value.id, id);
                assert.equal(parsed.value.apiVersion, 1);
                assert.ok(parsed.value.ui?.sdk);
                assert.equal(parsed.value.ui?.entry, "ui/dist/index.js");
            }
        });
    }

    it("defaults solar public tiles on and battery discharge to always-solar", () => {
        const raw = JSON.parse(
            readFileSync(path.join(process.cwd(), "plugins", "solar", "plugin.json"), "utf8"),
        ) as {config: Record<string, {default?: unknown}>};
        assert.equal(raw.config.publicPv.default, true);
        assert.equal(raw.config.publicBattery.default, true);
        assert.equal(raw.config.publicGrid.default, true);
        assert.equal(raw.config.publicTentShare.default, true);
        assert.equal(raw.config.batteryDischargeOrigin.default, "always-solar");
    });

    it("loads plugin UI through the import map, not a first-party Next import()", () => {
        const mount = readFileSync(path.join(process.cwd(), "components", "plugin-mount.tsx"), "utf8");
        const map = readFileSync(path.join(process.cwd(), "components", "plugin-import-map.tsx"), "utf8");
        assert.match(mount, /webpackIgnore: true/);
        assert.match(mount, /pluginAssetUrl/);
        assert.match(mount, /web-component/);
        assert.doesNotMatch(mount, /FIRST_PARTY/);
        assert.doesNotMatch(mount, /from ['"]@\/plugins\//);
        assert.match(map, /type="importmap"/);
    });
});
