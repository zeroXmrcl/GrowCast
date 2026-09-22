import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {describe, it} from "node:test";

describe("gallery sheet", () => {
    it("puts the player and snapshots on one board and does not stamp a date", async () => {
        const page = await readFile(new URL("../app/(site)/gallery/page.tsx", import.meta.url), "utf8");
        const gallery = await readFile(new URL("../components/snapshot-gallery.tsx", import.meta.url), "utf8");
        const player = await readFile(new URL("../components/timelapse-player.tsx", import.meta.url), "utf8");

        assert.match(page, /WORKSPACE_BOARD_CLASS/);
        assert.match(page, /<TimelapsePlayer sheet\/>/);
        assert.match(page, /<SnapshotGallery sheet\/>/);
        assert.match(gallery, /grid-cols-2 lg:grid-cols-4/);
        assert.match(gallery, /growcast-stills/);
        assert.equal(/stamp|formatDateDisplay/.test(gallery), false);
        assert.match(player, /text-xl font-semibold text-zinc-900 dark:text-zinc-100/);
        assert.match(gallery, /rounded-2xl/);
        assert.match(gallery, /href=\{snapshot\.url\}/);
        assert.match(gallery, /src=\{snapshotThumbSrc\(snapshot\.url\)\}/);
        assert.equal(/src=\{snapshot\.url\}/.test(gallery), false);
    });
});
