import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {navItemsFor, type NavFlags} from "../lib/site-nav.ts";

const allOn: NavFlags = {
    showEnergy: true,
    showGallery: true,
    showPastGrows: true,
    showSettingsLink: true,
};

describe("overlay chrome", () => {
    it("lives at /overlay outside the site frame", () => {
        const overlayLayout = path.join(process.cwd(), "app", "overlay", "layout.tsx");
        const overlayPage = path.join(process.cwd(), "app", "overlay", "page.tsx");
        const siteOverlay = path.join(process.cwd(), "app", "(site)", "overlay", "page.tsx");
        assert.equal(existsSync(overlayLayout), true);
        assert.equal(existsSync(overlayPage), true);
        assert.equal(existsSync(siteOverlay), false);

        const src = readFileSync(overlayLayout, "utf8");
        assert.equal(src.includes("SiteHeader"), false);
        assert.equal(src.includes("SITE_FRAME_CLASS"), false);
    });

    it("does not add Overlay to public nav", () => {
        for (const pathname of ["/", "/gallery", "/energy", "/overlay", "/admin"]) {
            const items = navItemsFor(pathname, allOn);
            assert.equal(
                items.some((item) => item.href === "/overlay" || item.label === "Overlay"),
                false,
            );
        }
        const navSrc = readFileSync(path.join(process.cwd(), "lib", "site-nav.ts"), "utf8");
        assert.equal(navSrc.includes("/overlay"), false);
    });

    it("does not load program audio or alerts on public overlay or homepage", () => {
        const overlay = readFileSync(
            path.join(process.cwd(), "app", "overlay", "page.tsx"),
            "utf8",
        );
        const home = readFileSync(path.join(process.cwd(), "app", "(site)", "page.tsx"), "utf8");
        assert.match(overlay, /OverlayHud/);
        assert.doesNotMatch(overlay, /ProgramScene|ProgramAudio|OverlayAlertLayer|OverlayMusicWave/);
        assert.doesNotMatch(overlay, /extra=/);
        assert.doesNotMatch(home, /ProgramScene|ProgramAudio|OverlayAlertLayer|OverlayMusicWave/);
    });

    it("does not add Program to public nav", () => {
        for (const pathname of ["/", "/gallery", "/energy", "/overlay", "/admin", "/program"]) {
            const items = navItemsFor(pathname, allOn);
            assert.equal(
                items.some((item) => item.href === "/program" || item.label === "Program"),
                false,
            );
        }
        const navSrc = readFileSync(path.join(process.cwd(), "lib", "site-nav.ts"), "utf8");
        assert.equal(navSrc.includes("/program"), false);
    });

    it("builds the OBS URL from the public origin helper on the Stream page", () => {
        const pageSrc = readFileSync(
            path.join(process.cwd(), "app", "admin", "stream", "page.tsx"),
            "utf8",
        );
        const fieldsSrc = readFileSync(
            path.join(process.cwd(), "app", "admin", "stream-fields.tsx"),
            "utf8",
        );
        assert.match(pageSrc, /shareCardMetadataOrigin/);
        assert.match(pageSrc, /overlayPublicUrl/);
        const scaleSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-scale-input.tsx"),
            "utf8",
        );
        assert.match(fieldsSrc, /name="overlayLayout"/);
        assert.match(fieldsSrc, /name="overlayStream"/);
        assert.match(fieldsSrc, /OverlayScaleInput/);
        assert.match(scaleSrc, /name = "overlayScalePct"/);
        assert.match(scaleSrc, /name=\{name\}/);
        assert.doesNotMatch(fieldsSrc, /alertScalePct/);
        assert.match(fieldsSrc, /1920x1080/);
        assert.doesNotMatch(fieldsSrc, /[?]layout=/);
        assert.doesNotMatch(fieldsSrc, /[?]stream=/);
        assert.doesNotMatch(fieldsSrc, /[?]scale=/);
        assert.doesNotMatch(scaleSrc, /[?]scale=/);
    });

    it("does not pause overlay polls when the Browser Source is hidden", () => {
        const hudSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-hud.tsx"),
            "utf8",
        );
        assert.equal(hudSrc.includes("shouldPollEnergy"), false);
        assert.match(hudSrc, /ENERGY_POLL_MS/);
        assert.match(hudSrc, /OVERLAY_GROW_POLL_MS/);
    });

    it("embeds the grow stream only when overlayStream is include", () => {
        const shellSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-shell.tsx"),
            "utf8",
        );
        const hudSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-hud.tsx"),
            "utf8",
        );
        const energySrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-energy.tsx"),
            "utf8",
        );
        const identitySrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-identity.tsx"),
            "utf8",
        );
        assert.match(shellSrc, /overlayStreamEmbeds/);
        assert.match(shellSrc, /overlayHudScaleStyle/);
        assert.match(shellSrc, /OverlayCamera/);
        assert.doesNotMatch(shellSrc, /<iframe/);
        assert.match(shellSrc, /look\??:/);
        assert.match(shellSrc, /absolute inset-0 z-0/);
        assert.match(hudSrc, /overlayStream/);
        assert.match(hudSrc, /overlayScalePct/);
        assert.match(hudSrc, /extra\?:/);
        assert.match(hudSrc, /\{extra\}/);
        assert.match(hudSrc, /look\??:/);
        assert.match(hudSrc, /look=\{look/);
        assert.doesNotMatch(hudSrc, /OVERLAY_ORDER_MUSIC/);
        assert.match(energySrc, /overlayEnergyGrowWindow/);
        assert.match(identitySrc, /overlayIdentityView/);
        assert.doesNotMatch(identitySrc, /health/i);
    });

    it("paints a GrowCast watermark like the OG card, outside the scaled HUD", () => {
        const shellSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-shell.tsx"),
            "utf8",
        );
        const markSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-watermark.tsx"),
            "utf8",
        );
        assert.match(shellSrc, /OverlayWatermark/);
        assert.match(markSrc, /growCastLogo_green\.svg/);
        assert.match(markSrc, /GrowCast/);
        assert.match(markSrc, /pointer-events-none/);
        assert.match(markSrc, /drop-shadow/);
        assert.match(markSrc, /absolute right-6 top-6/);
        assert.match(markSrc, /absolute right-6 bottom-6/);
        assert.match(markSrc, /z-10/);
        assert.doesNotMatch(markSrc, /overlayHudScaleStyle/);
        assert.doesNotMatch(markSrc, /overlayAlertScaleStyle/);
    });

    it("grades the cam wrap, not the HUD or watermark", () => {
        const shellSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-shell.tsx"),
            "utf8",
        );
        const cam = shellSrc.indexOf("<OverlayCamera");
        const hud = shellSrc.indexOf("style={scaleStyle}");
        const mark = shellSrc.indexOf("<OverlayWatermark");
        const wrap = shellSrc.indexOf("z-0");
        assert.ok(wrap >= 0 && cam > wrap);
        assert.ok(hud > cam);
        assert.ok(mark > hud);
        assert.match(shellSrc, /EMPTY_CAMERA_LOOK/);
        assert.match(shellSrc, /look=\{look\}/);
    });

    it("public overlay SSR-feeds saved look, not a draft listener", () => {
        const page = readFileSync(path.join(process.cwd(), "app", "overlay", "page.tsx"), "utf8");
        assert.match(page, /readCameraLook/);
        assert.match(page, /look=\{/);
        assert.doesNotMatch(page, /growcast-camera-look/);
        assert.doesNotMatch(page, /addEventListener\("message"/);
    });

    it("omits the LIVE badge and shows humidity to one decimal", () => {
        const climateSrc = readFileSync(
            path.join(process.cwd(), "components", "overlay-climate.tsx"),
            "utf8",
        );
        assert.doesNotMatch(climateSrc, /overlay-live-dot/);
        assert.doesNotMatch(climateSrc, /["']LIVE["']/);
        assert.match(climateSrc, /formatHumidityPctTenths/);
        assert.doesNotMatch(climateSrc, /formatHumidityPct\(/);
    });

    it("plays HLS in OverlayCamera with the GrowCast reconnect cover", () => {
        const cam = readFileSync(
            path.join(process.cwd(), "components", "overlay-camera.tsx"),
            "utf8",
        );
        const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
        assert.match(cam, /"use client"/);
        assert.match(cam, /from "hls\.js"/);
        assert.match(cam, /hlsPlaylistUrl/);
        assert.match(cam, /coverShouldHide/);
        assert.match(cam, /COVER_MIN_MS/);
        assert.match(cam, /COVER_FADE_MS/);
        assert.match(cam, /growCastLogo_green\.svg/);
        assert.match(cam, />GrowCast</);
        assert.match(cam, />Reconnecting</);
        assert.match(cam, /blur\(14px\)/);
        assert.match(cam, /<video/);
        assert.match(cam, /muted/);
        assert.match(cam, /playsInline/);
        assert.match(cam, /cameraLookFilterCss/);
        assert.match(cam, /cameraLookTemperatureStyle/);
        assert.match(cam, /filter:/);
        assert.match(cam, /Hls\.isSupported/);
        assert.match(cam, /loadSource/);
        assert.match(cam, /drawImage/);
        assert.match(cam, /removeAttribute\("src"\)/);
        assert.match(cam, /transitionDuration/);
        assert.match(css, /growcast-cover-breathe/);
        assert.match(css, /prefers-reduced-motion/);
    });

    it("embeds OverlayCamera on the homepage, not a MediaMTX iframe", () => {
        const home = readFileSync(
            path.join(process.cwd(), "app", "(site)", "page.tsx"),
            "utf8",
        );
        assert.match(home, /OverlayCamera/);
        assert.match(home, /streamUrl=\{streamUrl\}/);
        assert.doesNotMatch(home, /<iframe/);
        assert.match(home, /No Stream configured/);
        assert.doesNotMatch(home, /look=/);
    });
});
