import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {describe, it} from "node:test";

describe("TimelapsePlayer heading", () => {
    it("uses readable zinc text on a light background, not white-on-white", async () => {
        const src = await readFile(new URL("../components/timelapse-player.tsx", import.meta.url), "utf8");
        assert.match(src, /text-xl font-semibold text-zinc-900 dark:text-zinc-100/);
        assert.equal(/<h2 className="text-xl font-semibold text-white">/.test(src), false);
    });
});
