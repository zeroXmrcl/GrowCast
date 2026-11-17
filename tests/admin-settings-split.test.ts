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

    it("lists generic admin routes and loads extra plugin pages from the host", () => {
        const chromeSrc = src(path.join("app", "admin", "admin-chrome.tsx"));
        assert.match(chromeSrc, /href: "\/admin"/);
        assert.match(chromeSrc, /href: "\/admin\/plugins"/);
        assert.match(chromeSrc, /href: "\/admin\/archives"/);
        assert.match(chromeSrc, /href: "\/admin\/security"/);
        assert.match(chromeSrc, /label: "Grow"/);
        assert.match(chromeSrc, /label: "Plugins"/);
        assert.match(chromeSrc, /label: "Archives"/);
        assert.match(chromeSrc, /label: "Security"/);
        assert.match(chromeSrc, /pluginAdminNavItems/);
        assert.doesNotMatch(chromeSrc, /label: "Broadcast"/);
        assert.doesNotMatch(chromeSrc, /label: "Timelapse"/);
        assert.doesNotMatch(chromeSrc, /label: "GGS"/);
        assert.doesNotMatch(chromeSrc, /href: "#[a-z]+"/);
        assert.doesNotMatch(chromeSrc, /hidden lg:block/);
        assert.match(chromeSrc, /AdminSectionNav/);
    });

    it("keeps twitch/timelapse/energy/complete-grow off the Grow form", () => {
        const growFields = src(path.join("app", "admin", "settings-fields.tsx"));
        const growPage = src(path.join("app", "admin", "page.tsx"));
        assert.doesNotMatch(growFields, /id="twitch"/);
        assert.doesNotMatch(growFields, /timelapsePaused/);
        assert.doesNotMatch(growFields, /energyPublicTariff/);
        assert.doesNotMatch(growFields, /confirmArchive/);
        assert.doesNotMatch(growPage, /CompleteGrowPanel/);
        assert.doesNotMatch(growPage, /RestreamPanel/);
        assert.doesNotMatch(growPage, /GROWCAST_RESTREAM_STREAM_URL/);
        assert.match(growPage, /GrowSettingsFields/);
        assert.match(growPage, /StreamSettingsFields/);
        assert.match(growPage, /MediaManager/);
        assert.match(growFields, /name="showSettingsLink"/);
    });

    it("renders OverlayHud on the program scene as include+lockStream using grow.streamUrl", () => {
        const programPage = src(path.join("plugins", "restream", "pages", "program.tsx"));
        const scene = src(path.join("plugins", "restream", "ui", "program-scene.tsx"));
        const lookHud = src(path.join("plugins", "restream", "ui", "program-camera-look.tsx"));
        const monitor = src(path.join("plugins", "restream", "admin", "program-monitor.tsx"));
        const streamPage = src(path.join("plugins", "restream", "admin", "page.tsx"));
        const host = src(path.join("plugins", "restream", "host", "index.ts"));
        assert.match(lookHud, /overlayStream="include"/);
        assert.match(scene, /ProgramCameraLook/);
        assert.match(scene, /lockStream/);
        assert.match(programPage, /streamUrl=\{grow\.streamUrl\}/);
        assert.doesNotMatch(programPage, /ON AIR/);
        assert.doesNotMatch(programPage, /GROWCAST_RESTREAM_STREAM_URL/);
        assert.doesNotMatch(programPage, /captureStreamUrl/);
        assert.doesNotMatch(programPage, /\/overlay\/capture/);
        assert.doesNotMatch(streamPage, /GROWCAST_RESTREAM_STREAM_URL/);
        assert.match(streamPage, /ProgramMonitor/);
        assert.doesNotMatch(streamPage, /StreamPreview/);
        assert.doesNotMatch(streamPage, /capture\?token/);
        assert.match(monitor, /src="\/p\/restream\/program"/);
        assert.doesNotMatch(monitor, /token=/);
        assert.doesNotMatch(streamPage, /capture\.token/);
        assert.doesNotMatch(streamPage, /GROWCAST_RESTREAM_TOKEN/);
        assert.doesNotMatch(programPage, /token/i);
        assert.match(host, /ensureRestreamCaptureToken/);
        assert.match(streamPage, /RestreamPanel/);
    });

    it("puts Complete Grow on Archives", () => {
        const archives = src(path.join("app", "admin", "archives", "page.tsx"));
        assert.match(archives, /CompleteGrowPanel/);
        assert.match(archives, /completeGrowAction/);
        assert.match(archives, /isAdminAuthenticated/);
        assert.match(archives, /redirect\("\/admin"\)/);
    });

    it("maps leftover admin hashes to plugin admin pages", () => {
        assert.equal(ADMIN_HASH_REDIRECTS["#twitch"], "/admin/plugins/growcast.restream");
        assert.equal(ADMIN_HASH_REDIRECTS["#stream"], "/admin/plugins/growcast.restream");
        assert.equal(ADMIN_HASH_REDIRECTS["#overlay"], "/admin");
        assert.equal(ADMIN_HASH_REDIRECTS["#timelapse"], "/admin/plugins/growcast.timelapse");
        assert.equal(ADMIN_HASH_REDIRECTS["#energy"], "/admin/plugins/growcast.ggs");
        assert.equal(ADMIN_HASH_REDIRECTS["#archive"], "/admin/archives");
        const growPage = src(path.join("app", "admin", "page.tsx"));
        assert.match(growPage, /AdminHashRedirect/);
        const streamPage = src(path.join("plugins", "restream", "admin", "page.tsx"));
        assert.doesNotMatch(streamPage, /AdminHashRedirect/);
    });

    it("does not interpolate GROWCAST_RESTREAM_TOKEN into restream environment", () => {
        const composeSrc = src("docker-compose.yml");
        const restream = composeSrc.split(/^  restream:\s*$/m)[1] ?? "";
        assert.doesNotMatch(restream, /path:\s*\.env\.local/);
        assert.doesNotMatch(restream, /env_file:/);
        assert.doesNotMatch(
            restream,
            /GROWCAST_RESTREAM_TOKEN:\s*\$\{GROWCAST_RESTREAM_TOKEN/,
        );
    });

    it("points Twitch Start at Stream and does not require a token in .env.local", () => {
        const notice = src(path.join("app", "admin", "admin-notice.tsx"));
        const pluginNotices = src(path.join("plugins", "restream", "plugin.json"));
        const readme = src("README.md");
        const restreamReadme = src(path.join("plugins", "restream", "README.md"));
        assert.doesNotMatch(notice, /compose profile twitch/);
        assert.doesNotMatch(notice, /plugin container is running/);
        assert.match(pluginNotices, /plugin container is running/);
        assert.match(readme, /\/admin\/plugins\/growcast\.restream/);
        assert.match(readme, /capture\.token/);
        assert.match(readme, /optional override/);
        assert.match(restreamReadme, /\/admin\/plugins\/growcast\.restream|\/admin\/stream/);
        assert.match(restreamReadme, /capture\.token/);
        assert.match(restreamReadme, /overrides that file/);
    });

    it("gates plugin admin pages like archives", () => {
        const page = src(path.join("app", "admin", "plugins", "[pluginId]", "[[...path]]", "page.tsx"));
        assert.match(page, /isAdminAuthenticated/);
        assert.match(page, /redirect\("\/admin"\)/);
    });
});
