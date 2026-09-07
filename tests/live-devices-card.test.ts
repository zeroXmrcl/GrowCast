import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import type {LiveDeviceTile} from "../lib/live-climate-view.ts";
import {
    LIVE_DEVICE_ITEM_CLASS,
    LIVE_DEVICE_ROW_CLASS,
    LIVE_DEVICE_VOID_CLASS,
    liveDeviceRowItems,
} from "../lib/live-devices-layout.ts";

function tile(id: string, label: string): LiveDeviceTile {
    return {
        id,
        kind: "fan",
        label,
        running: false,
        levelText: "OFF",
        accessibleName: `${label}: OFF`,
    };
}

describe("liveDeviceRowItems", () => {
    it("returns no items when there are no tiles", () => {
        assert.deepEqual(liveDeviceRowItems([]), []);
    });

    it("omits voids for a single tile", () => {
        const light = tile("light", "Light");
        assert.deepEqual(liveDeviceRowItems([light]), [
            {kind: "tile", key: "light", tile: light},
        ]);
    });

    it("inserts a shrinking void between each pair of tiles", () => {
        const light = tile("light", "Light");
        const fan = tile("fan", "Fan");
        const heater = tile("heater", "Heater");
        assert.deepEqual(liveDeviceRowItems([light, fan, heater]), [
            {kind: "tile", key: "light", tile: light},
            {kind: "void", key: "void-fan"},
            {kind: "tile", key: "fan", tile: fan},
            {kind: "void", key: "void-heater"},
            {kind: "tile", key: "heater", tile: heater},
        ]);
    });
});

describe("live device layout classes", () => {
    it("keeps a wrapping centered row below lg and nowrap beside Climate", () => {
        assert.match(LIVE_DEVICE_ROW_CLASS, /\bflex-wrap\b/);
        assert.match(LIVE_DEVICE_ROW_CLASS, /\bjustify-center\b/);
        assert.match(LIVE_DEVICE_ROW_CLASS, /\bgap-4\b/);
        assert.match(LIVE_DEVICE_ROW_CLASS, /\blg:flex-nowrap\b/);
        assert.match(LIVE_DEVICE_ROW_CLASS, /\blg:gap-0\b/);
    });

    it("lets the 1rem void shrink before tiles, and only from lg up", () => {
        assert.match(LIVE_DEVICE_VOID_CLASS, /\bhidden\b/);
        assert.match(LIVE_DEVICE_VOID_CLASS, /\blg:block\b/);
        assert.match(LIVE_DEVICE_VOID_CLASS, /\bw-4\b/);
        assert.match(LIVE_DEVICE_VOID_CLASS, /\bmax-w-4\b/);
        assert.match(LIVE_DEVICE_VOID_CLASS, /\bbasis-4\b/);
        assert.match(LIVE_DEVICE_VOID_CLASS, /\bshrink-\[100\]/);
        assert.match(LIVE_DEVICE_VOID_CLASS, /\bgrow-0\b/);
        assert.match(LIVE_DEVICE_VOID_CLASS, /\bmin-w-0\b/);
    });

    it("caps tiles at 4.75rem and allows shrink after the void is gone", () => {
        assert.match(LIVE_DEVICE_ITEM_CLASS, /w-\[4\.75rem\]/);
        assert.match(LIVE_DEVICE_ITEM_CLASS, /max-w-\[4\.75rem\]/);
        assert.match(LIVE_DEVICE_ITEM_CLASS, /basis-\[4\.75rem\]/);
        assert.match(LIVE_DEVICE_ITEM_CLASS, /\bmin-w-0\b/);
        assert.match(LIVE_DEVICE_ITEM_CLASS, /\bshrink\b/);
        assert.match(LIVE_DEVICE_ITEM_CLASS, /\bgrow-0\b/);
    });
});

describe("live devices card wiring", () => {
    it("uses the layout helper, truncates names, and shrinks the tile with its item", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components", "live-devices-card.tsx"),
            "utf8",
        );
        assert.match(src, /liveDeviceRowItems/);
        assert.match(src, /LIVE_DEVICE_ROW_CLASS/);
        assert.match(src, /LIVE_DEVICE_VOID_CLASS/);
        assert.match(src, /LIVE_DEVICE_ITEM_CLASS/);
        assert.match(src, /\baria-hidden/);
        assert.match(src, /\btruncate\b/);
        assert.match(src, /w-full min-w-0/);
        assert.match(src, /max-w-full/);
        assert.doesNotMatch(src, /flex-wrap gap-4/);
    });

    it("does not change overlay gear wrapping", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components", "overlay-gear.tsx"),
            "utf8",
        );
        assert.match(src, /flex flex-wrap gap-2/);
        assert.equal(src.includes("lg:flex-nowrap"), false);
        assert.equal(src.includes("liveDeviceRowItems"), false);
    });
});
