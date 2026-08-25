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

    it("builds the OBS URL from the public origin helper in Settings", () => {
        const pageSrc = readFileSync(path.join(process.cwd(), "app", "admin", "page.tsx"), "utf8");
        const fieldsSrc = readFileSync(
            path.join(process.cwd(), "app", "admin", "settings-fields.tsx"),
            "utf8",
        );
        assert.match(pageSrc, /shareCardMetadataOrigin/);
        assert.match(pageSrc, /overlayPublicUrl/);
        assert.match(fieldsSrc, /name="overlayLayout"/);
        assert.match(fieldsSrc, /name="overlayStream"/);
        assert.match(fieldsSrc, /1920×1080/);
        assert.doesNotMatch(fieldsSrc, /[?]layout=/);
        assert.doesNotMatch(fieldsSrc, /[?]stream=/);
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
        assert.match(shellSrc, /<iframe/);
        assert.match(hudSrc, /overlayStream/);
        assert.match(energySrc, /overlayEnergyGrowWindow/);
        assert.match(identitySrc, /overlayIdentityView/);
        assert.doesNotMatch(identitySrc, /health/i);
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
});
