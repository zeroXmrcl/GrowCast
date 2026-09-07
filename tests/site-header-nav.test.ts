import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {navItemsFor, type NavFlags} from "../lib/site-nav.ts";

const allOn: NavFlags = {
    showEnergy: true,
    showGallery: true,
    showPastGrows: true,
    showSettingsLink: true,
};

describe("navItemsFor", () => {
    it("hides the current section and appends Settings last when enabled", () => {
        assert.deepEqual(
            navItemsFor("/gallery", allOn).map((item) => item.href),
            ["/", "/energy", "/grows", "/admin"],
        );
    });

    it("omits Settings when the flag is off", () => {
        assert.deepEqual(
            navItemsFor("/gallery", {...allOn, showSettingsLink: false}).map((item) => item.href),
            ["/", "/energy", "/grows"],
        );
    });

    it("does not append Settings on admin routes", () => {
        assert.deepEqual(
            navItemsFor("/admin/archives", allOn).map((item) => item.href),
            ["/", "/energy", "/gallery", "/grows"],
        );
    });

    it("includes Energy only when GGS live data exists, and hides it on the energy page", () => {
        assert.deepEqual(
            navItemsFor("/energy", {...allOn, showSettingsLink: false}).map((item) => item.href),
            ["/", "/gallery", "/grows"],
        );
        assert.equal(
            navItemsFor("/", {...allOn, showEnergy: false, showSettingsLink: false})
                .some((item) => item.href === "/energy"),
            false,
        );
    });

    it("omits Past Grows when no grow has been archived", () => {
        assert.deepEqual(
            navItemsFor("/", {...allOn, showPastGrows: false, showSettingsLink: false}).map(
                (item) => item.href,
            ),
            ["/energy", "/gallery"],
        );
    });

    it("never includes Overlay in the public header", () => {
        const hrefs = navItemsFor("/", allOn).map((item) => item.href);
        assert.equal(hrefs.includes("/overlay"), false);
        assert.equal(
            navItemsFor("/overlay", allOn).some((item) => item.label === "Overlay"),
            false,
        );
    });

    it("omits Gallery when the timelapse plugin is not installed", () => {
        assert.deepEqual(
            navItemsFor("/", {...allOn, showGallery: false, showSettingsLink: false}).map(
                (item) => item.href,
            ),
            ["/energy", "/grows"],
        );
    });
});
