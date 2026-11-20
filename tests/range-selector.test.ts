import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {describe, it} from "node:test";

function src(rel: string): string {
    return readFileSync(rel, "utf8");
}

describe("shared range selector", () => {
    it("is the climate underline control, with press and drag, and reduced motion", () => {
        const selector = src("packages/plugin-sdk/src/ui/range-selector.tsx");
        const kit = src("packages/plugin-sdk/src/ui/index.ts");
        assert.match(kit, /RangeSelector/);
        assert.match(selector, /aria-label=\{label\}/);
        assert.match(selector, /data-range/);
        assert.match(selector, /setPointerCapture/);
        assert.match(selector, /onPointerMove/);
        assert.match(selector, /data-press/);
        assert.match(selector, /prefers-reduced-motion: reduce/);
        assert.match(selector, /translateY\(1px\)/);
        assert.match(selector, /transform 220ms/);
    });
});
