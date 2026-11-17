import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {navItemIsActive, navItemsFor, type NavFlags} from "../lib/site-nav.ts";

const allOn: NavFlags = {
    showPastGrows: true,
    showSettingsLink: true,
};

describe("navItemsFor", () => {
    it("hides the current section and appends Settings last when enabled", () => {
        assert.deepEqual(
            navItemsFor("/p/timelapse/gallery", allOn).map((item) => item.href),
            ["/", "/grows", "/admin"],
        );
    });

    it("omits Settings when the flag is off", () => {
        assert.deepEqual(
            navItemsFor("/p/timelapse/gallery", {...allOn, showSettingsLink: false}).map((item) => item.href),
            ["/", "/grows"],
        );
    });

    it("does not append Settings on admin routes", () => {
        assert.deepEqual(
            navItemsFor("/admin/archives", allOn).map((item) => item.href),
            ["/", "/grows"],
        );
    });

    it("keeps Energy visible and bold on the energy page, and hides Gallery when it is current", () => {
        const extra = [
            {href: "/p/ggs/energy", label: "Energy"},
            {href: "/p/solar", label: "Solar"},
            {href: "/p/timelapse/gallery", label: "Gallery"},
        ];
        assert.deepEqual(
            navItemsFor("/", {...allOn, showSettingsLink: false}, extra).map((item) => item.label),
            ["Dashboard", "Energy", "Solar", "Gallery", "Past Grows"],
        );
        assert.deepEqual(
            navItemsFor("/p/ggs/energy", {...allOn, showSettingsLink: false}, extra).map((item) => item.label),
            ["Dashboard", "Energy", "Solar", "Gallery", "Past Grows"],
        );
        assert.equal(navItemIsActive("/p/ggs/energy", "/p/ggs/energy"), true);
        assert.equal(navItemIsActive("/p/ggs/energy/detail", "/p/ggs/energy"), true);
        assert.equal(navItemIsActive("/p/ggs/energy-other", "/p/ggs/energy"), false);
        assert.equal(navItemIsActive("/p/ggs/energy", "/"), false);
        assert.equal(navItemIsActive("/", "/p/ggs/energy"), false);
        assert.deepEqual(
            navItemsFor("/p/timelapse/gallery", {...allOn, showSettingsLink: false}, extra).map((item) => item.label),
            ["Dashboard", "Energy", "Solar", "Past Grows"],
        );
        assert.equal(navItemIsActive("/p/timelapse/gallery", "/p/timelapse/gallery"), true);
        assert.equal(navItemIsActive("/p/timelapse/gallery/2026", "/p/timelapse/gallery"), true);
        assert.deepEqual(
            navItemsFor("/p/solar", {...allOn, showSettingsLink: false}, extra).map((item) => item.label),
            ["Dashboard", "Energy", "Gallery", "Past Grows"],
        );
    });

    it("omits Past Grows when no grow has been archived", () => {
        assert.deepEqual(
            navItemsFor("/", {...allOn, showPastGrows: false, showSettingsLink: false}).map(
                (item) => item.href,
            ),
            ["/"],
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

    it("inserts extra plugin pages after Dashboard", () => {
        assert.deepEqual(
            navItemsFor("/", {...allOn, showSettingsLink: false}, [
                {href: "/p/solar/energy", label: "Solar"},
            ]).map((item) => item.href),
            ["/", "/p/solar/energy", "/grows"],
        );
    });
});
