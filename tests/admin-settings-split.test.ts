import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {ADMIN_HASH_REDIRECTS} from "../app/admin/hash-redirects.ts";
import {navItemsFor, type NavFlags} from "../lib/site-nav.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const allOn: NavFlags = {
    showEnergy: true,
    showGallery: true,
    showPastGrows: true,
    showSettingsLink: true,
};

describe("admin settings split", () => {
    it("keeps public Settings → /admin and omits Capture/Twitch from public nav", () => {
        const items = navItemsFor("/", allOn);
        assert.equal(
            items.some((item) => item.href === "/admin" && item.label === "Settings"),
            true,
        );
        for (const pathname of ["/", "/overlay", "/admin"]) {
            const nav = navItemsFor(pathname, allOn);
            assert.equal(
                nav.some((item) => /capture|twitch/i.test(item.href + item.label)),
                false,
            );
        }
    });

    it("lists five admin page routes instead of 14 hashes", () => {
        const chromeSrc = src(path.join("app", "admin", "admin-chrome.tsx"));
        assert.match(chromeSrc, /href: "\/admin"/);
        assert.match(chromeSrc, /href: "\/admin\/stream"/);
        assert.match(chromeSrc, /href: "\/admin\/timelapse"/);
        assert.match(chromeSrc, /href: "\/admin\/ggs"/);
        assert.match(chromeSrc, /href: "\/admin\/archives"/);
        assert.match(chromeSrc, /label: "Grow"/);
        assert.match(chromeSrc, /label: "Broadcast"/);
        assert.match(chromeSrc, /label: "Timelapse"/);
        assert.match(chromeSrc, /label: "GGS"/);
        assert.match(chromeSrc, /label: "Archives"/);
        assert.doesNotMatch(chromeSrc, /href: "#[a-z]+"/);
        assert.doesNotMatch(chromeSrc, /hidden lg:block/);
        assert.match(chromeSrc, /AdminSectionNav/);
        assert.equal([...chromeSrc.matchAll(/href: "\/admin(?:\/[a-z]+)?"/g)].length, 5);
    });

    it("keeps stream/overlay/twitch/timelapse/energy/complete-grow off the Grow form", () => {
        const growFields = src(path.join("app", "admin", "settings-fields.tsx"));
        const growPage = src(path.join("app", "admin", "page.tsx"));
        assert.doesNotMatch(growFields, /name="streamUrl"/);
        assert.doesNotMatch(growFields, /name="overlayLayout"/);
        assert.doesNotMatch(growFields, /name="overlayStream"/);
        assert.doesNotMatch(growFields, /name="showGrowName"/);
        assert.doesNotMatch(growFields, /id="twitch"/);
        assert.doesNotMatch(growFields, /timelapsePaused/);
        assert.doesNotMatch(growFields, /energyPublicTariff/);
        assert.doesNotMatch(growFields, /confirmArchive/);
        assert.doesNotMatch(growPage, /CompleteGrowPanel/);
        assert.doesNotMatch(growPage, /RestreamPanel/);
        assert.doesNotMatch(growPage, /GROWCAST_RESTREAM_STREAM_URL/);
        assert.match(growPage, /GrowSettingsFields/);
        assert.match(growPage, /MediaManager/);
        assert.match(growFields, /name="showSettingsLink"/);
    });

    it("renders OverlayHud on Stream as include+lockStream using grow.streamUrl", () => {
        const preview = src(path.join("app", "admin", "stream-preview.tsx"));
        const streamPage = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(preview, /overlayStream="include"/);
        assert.match(preview, /lockStream/);
        assert.match(preview, /streamUrl=\{grow\.streamUrl\}/);
        assert.match(preview, /Save a Stream URL/);
        assert.doesNotMatch(preview, /ON AIR/);
        assert.doesNotMatch(preview, /GROWCAST_RESTREAM_STREAM_URL/);
        assert.doesNotMatch(preview, /captureStreamUrl/);
        assert.doesNotMatch(preview, /\/overlay\/capture/);
        assert.doesNotMatch(streamPage, /GROWCAST_RESTREAM_STREAM_URL/);
        assert.doesNotMatch(streamPage, /<iframe/);
        assert.doesNotMatch(preview, /<iframe/);
        assert.doesNotMatch(streamPage, /capture\.token/);
        assert.doesNotMatch(streamPage, /GROWCAST_RESTREAM_TOKEN/);
        assert.doesNotMatch(preview, /token/i);
        assert.match(streamPage, /ensureRestreamCaptureToken/);
        assert.match(streamPage, /RestreamPanel/);
    });

    it("puts Complete Grow on Archives", () => {
        const archives = src(path.join("app", "admin", "archives", "page.tsx"));
        assert.match(archives, /CompleteGrowPanel/);
        assert.match(archives, /completeGrowAction/);
        assert.match(archives, /isAdminAuthenticated/);
        assert.match(archives, /redirect\("\/admin"\)/);
    });

    it("maps leftover #twitch to /admin/stream", () => {
        const helper = src(path.join("app", "admin", "hash-redirects.ts"));
        assert.equal(ADMIN_HASH_REDIRECTS["#twitch"], "/admin/stream");
        assert.equal(ADMIN_HASH_REDIRECTS["#stream"], "/admin/stream");
        assert.equal(ADMIN_HASH_REDIRECTS["#overlay"], "/admin/stream");
        assert.equal(ADMIN_HASH_REDIRECTS["#timelapse"], "/admin/timelapse");
        assert.equal(ADMIN_HASH_REDIRECTS["#energy"], "/admin/ggs");
        assert.equal(ADMIN_HASH_REDIRECTS["#archive"], "/admin/archives");
        assert.match(helper, /#twitch/);
        assert.match(helper, /\/admin\/stream/);
        const growPage = src(path.join("app", "admin", "page.tsx"));
        assert.match(growPage, /AdminHashRedirect/);
        const streamPage = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.doesNotMatch(streamPage, /AdminHashRedirect/);
    });

    it("does not interpolate GROWCAST_RESTREAM_TOKEN into restream environment", () => {
        const composeSrc = src("docker-compose.yml");
        assert.doesNotMatch(
            composeSrc,
            /GROWCAST_RESTREAM_TOKEN:\s*\$\{GROWCAST_RESTREAM_TOKEN/,
        );
    });

    it("points Twitch Start at Stream and does not require a token in .env.local", () => {
        const notice = src(path.join("app", "admin", "admin-notice.tsx"));
        const readme = src("README.md");
        const restreamReadme = src(path.join("extensions", "GrowCast-Restream", "README.md"));
        assert.doesNotMatch(notice, /compose profile twitch/);
        assert.match(notice, /restream service is running/);
        assert.match(readme, /\/admin\/stream/);
        assert.match(readme, /capture\.token/);
        assert.match(readme, /optional override/);
        assert.match(restreamReadme, /\/admin\/stream/);
        assert.match(restreamReadme, /capture\.token/);
        assert.match(restreamReadme, /overrides that file/);
    });

    it("gates Stream, Timelapse, and GGS like archives", () => {
        for (const rel of [
            path.join("app", "admin", "stream", "page.tsx"),
            path.join("app", "admin", "timelapse", "page.tsx"),
            path.join("app", "admin", "ggs", "page.tsx"),
        ]) {
            const page = src(rel);
            assert.match(page, /isAdminAuthenticated/);
            assert.match(page, /redirect\("\/admin"\)/);
        }
    });
});
