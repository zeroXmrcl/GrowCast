import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {describe, it} from "node:test";

describe("plugin banner slot", () => {
    it("mounts a plugin banner on every page and hides it until a notice is present", () => {
        const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
        const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
        const types = readFileSync(new URL("../../lib/plugins/types.ts", import.meta.url), "utf8");
        const widgets = readFileSync(new URL("../../components/plugin-widgets.tsx", import.meta.url), "utf8");
        assert.match(layout, /<PluginWidgets slot="banner" \/>/);
        assert.match(widgets, /slot === "banner"/);
        assert.match(css, /growcast-plugin-banner:not\(:has\(\.gc-power-notice\)\)/);
        assert.match(types, /\| "banner"/);
    });
});
