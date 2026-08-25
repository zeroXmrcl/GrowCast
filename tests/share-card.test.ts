import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    buildShareCardCopy,
    pickShareCardStill,
    shareCardMetadataOrigin,
    shareCardOgImageId,
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

describe("shareCardMetadataOrigin", () => {
    it("matches CSRF publicRequestOrigin for Cloudflare Tunnel Host vs listen X-Forwarded-Host", () => {
        assert.equal(
            shareCardMetadataOrigin({
                host: "tunnel.example",
                "x-forwarded-host": "0.0.0.0:3000",
                "x-forwarded-proto": "https",
            }),
            "https://tunnel.example",
        );
    });

    it("uses GROWCAST_PUBLIC_URL when set", () => {
        assert.equal(
            shareCardMetadataOrigin(
                {host: "localhost:3000"},
                {GROWCAST_PUBLIC_URL: "https://grow.example.com"},
            ),
            "https://grow.example.com",
        );
    });

    it("does not use a spoofed X-Forwarded-Host when Host is the public tunnel name", () => {
        assert.equal(
            shareCardMetadataOrigin({
                host: "tunnel.example",
                "x-forwarded-host": "attacker.example",
                "x-forwarded-proto": "https",
            }),
            "https://tunnel.example",
        );
    });

    it("does not throw on junk proto or host", () => {
        assert.doesNotThrow(() =>
            shareCardMetadataOrigin({
                host: "%%%",
                "x-forwarded-proto": "https:",
            }),
        );
    });
});

describe("rasterizeShareCardAssets logo", () => {
    it("uses an SVG data URL and does not import sharp", async () => {
        const {readFileSync} = await import("node:fs");
        const src = readFileSync(new URL("../lib/share-card-image.ts", import.meta.url), "utf8");
        assert.equal(/import\(["']sharp["']\)/.test(src), false);
        assert.match(src, /image\/svg\+xml/);
    });
});

describe("shareCardOgImageId", () => {
    it("changes when the still name or mtime changes, and is URL-safe", () => {
        const snap = {kind: "snapshot" as const, name: "1002.webp"};
        const first = shareCardOgImageId(snap, 1_710_000_000_000);
        const renamed = shareCardOgImageId({kind: "snapshot", name: "1003.webp"}, 1_710_000_000_000);
        const replaced = shareCardOgImageId(snap, 1_710_000_000_500);
        const dashboard = shareCardOgImageId(
            {kind: "dashboard", name: "picture 1.jpeg"},
            100,
        );
        assert.equal(first, "snapshot-1002.webp-1710000000000");
        assert.notEqual(first, renamed);
        assert.notEqual(first, replaced);
        assert.equal(shareCardOgImageId(null, 0), "none");
        assert.match(dashboard, /^dashboard-picture_1.jpeg-100$/);
        assert.equal(/[^a-zA-Z0-9._-]/.test(dashboard), false);
    });
});

describe("opengraph-image still identity", () => {
    it("advertises generateImageMetadata so the og:image URL follows the still", async () => {
        const {readFile} = await import("node:fs/promises");
        const src = await readFile(
            new URL("../app/opengraph-image.tsx", import.meta.url),
            "utf8",
        );
        assert.match(src, /export async function generateImageMetadata/);
        assert.match(src, /shareCardOgImageId/);
        assert.match(src, /shareCardStillMtimeMs/);
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
