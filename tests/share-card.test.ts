import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    buildShareCardCopy,
    pickShareCardStill,
    publicHostFromHeaders,
    shareCardVisibleHost,
    stillImageMime,
} from "../lib/share-card.ts";

describe("buildShareCardCopy", () => {
    it("matches the mockup: plant, day, temp, humidity, host, and Discord description", () => {
        const copy = buildShareCardCopy({
            plant: "Tomatoes",
            daysSince: 176,
            climate: {tempC: 23.7, humidityPct: 47.1},
            host: "grow.0xmarcel.com",
        });
        assert.equal(copy.title, "GrowCast");
        assert.equal(copy.plant, "Tomatoes");
        assert.equal(copy.stats, "Day 176 · 23.7° · 47%");
        assert.equal(copy.host, "grow.0xmarcel.com");
        assert.equal(copy.description, "Live tent · Tomatoes · Day 176 · 23.7°");
    });

    it("falls back to Plants and omits missing climate and day", () => {
        const copy = buildShareCardCopy({
            plant: "",
            daysSince: null,
            climate: null,
            host: "grow.example.com",
        });
        assert.equal(copy.plant, "Plants");
        assert.equal(copy.stats, "");
        assert.equal(copy.description, "Live tent · Plants");
        assert.equal(copy.host, "grow.example.com");
    });

    it("omits climate from the stats line when GGS is not live", () => {
        const copy = buildShareCardCopy({
            plant: "Tomatoes",
            daysSince: 10,
            climate: null,
            host: "localhost",
        });
        assert.equal(copy.stats, "Day 10");
        assert.equal(copy.description, "Live tent · Tomatoes · Day 10");
    });
});

describe("pickShareCardStill", () => {
    it("prefers the newest timelapse snapshot, then dashboard, then setup", () => {
        assert.deepEqual(
            pickShareCardStill({
                snapshots: ["snap-2.webp", "snap-1.webp"],
                dashboard: ["picture-a.webp"],
                setup: ["setup-a.webp"],
            }),
            {kind: "snapshot", name: "snap-2.webp"},
        );
        assert.equal(
            pickShareCardStill({
                snapshots: [],
                dashboard: ["picture-old.webp", "picture-new.webp"],
                setup: ["setup-a.webp"],
            })?.name,
            "picture-new.webp",
        );
        assert.deepEqual(
            pickShareCardStill({
                snapshots: [],
                dashboard: [],
                setup: ["setup-1.webp", "setup-2.webp"],
            }),
            {kind: "setup", name: "setup-2.webp"},
        );
        assert.equal(
            pickShareCardStill({snapshots: [], dashboard: [], setup: []}),
            null,
        );
    });
});

describe("publicHostFromHeaders", () => {
    it("prefers the first X-Forwarded-Host and strips a default port", () => {
        assert.equal(
            publicHostFromHeaders("127.0.0.1:3000", "grow.0xmarcel.com, 10.0.0.1"),
            "grow.0xmarcel.com",
        );
        assert.equal(publicHostFromHeaders("grow.0xmarcel.com:443", null), "grow.0xmarcel.com");
        assert.equal(publicHostFromHeaders(null, null), "");
    });

    it("hides loopback hosts on the card", () => {
        assert.equal(shareCardVisibleHost("grow.0xmarcel.com"), "grow.0xmarcel.com");
        assert.equal(shareCardVisibleHost("localhost:3000"), "");
        assert.equal(shareCardVisibleHost("127.0.0.1:3000"), "");
    });
});

describe("stillImageMime", () => {
    it("maps jpeg/png for direct embed and webp for conversion", () => {
        assert.equal(stillImageMime("shot.jpg"), "image/jpeg");
        assert.equal(stillImageMime("shot.PNG"), "image/png");
        assert.equal(stillImageMime("shot.webp"), "image/webp");
        assert.equal(stillImageMime("notes.txt"), null);
    });
});
