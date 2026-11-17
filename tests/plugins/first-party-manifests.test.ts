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
            }
        });
    }
});
