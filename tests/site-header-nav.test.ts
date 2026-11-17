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

    it("keeps Dashboard visible and hides the current plugin page when extra is passed", () => {
        const extra = [{href: "/p/ggs/energy", label: "Energy"}];
        assert.deepEqual(
            navItemsFor("/", allOn, extra).map((item) => item.href),
            ["/", "/p/ggs/energy", "/grows", "/admin"],
        );
        assert.deepEqual(
            navItemsFor("/p/ggs/energy", {...allOn, showSettingsLink: false}, extra).map((item) => item.href),
            ["/", "/grows"],
        );
        assert.equal(navItemIsActive("/", "/"), true);
        assert.equal(navItemIsActive("/", "/p/ggs/energy"), false);
        assert.equal(navItemIsActive("/p/ggs/energy", "/p/ggs/energy"), true);
        assert.equal(navItemIsActive("/p/ggs/energy", "/"), false);
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
