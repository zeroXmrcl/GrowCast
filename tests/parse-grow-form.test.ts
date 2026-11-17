import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    parseAdminSettingsForm,
    parseStreamSettingsForm,
} from "../lib/admin/parse-grow-form.ts";
import {DEFAULT_TIMELAPSE_SETTINGS, normalizeTimelapseSettings} from "../plugins/timelapse/host/timelapse-settings.ts";

function formFrom(entries: Record<string, string>): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(entries)) {
        form.set(key, value);
    }
    return form;
}

describe("parseAdminSettingsForm", () => {
    it("allows https social URLs and parses overlay fields on the grow form", () => {
        const result = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                streamUrl: "https://stream.example.com/hls/",
                youtube: "https://www.youtube.com/@example",
                overlayLayout: "bottom-bar",
                overlayStream: "include",
                climateTick: "picker",
                showGrowName: "on",
                timelapseQuality: "high",
            }),
        );

        assert.equal(result.grow.socials?.youtube, "https://www.youtube.com/@example");
        assert.equal(result.grow.streamUrl, "https://stream.example.com/hls/");
        assert.equal(result.grow.showGrowName, true);
        assert.equal(result.grow.overlayLayout, "bottom-bar");
        assert.equal(result.grow.overlayStream, "include");
        assert.equal(result.grow.climateTick, "picker");
        assert.equal(result.grow.name, "Test Grow");
    });

    it("strips javascript: and data: URL schemes on socials", () => {
        const result = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                customWebsite: "data:text/html,hi",
                twitter: "https://x.com/ok",
            }),
        );

        assert.equal(result.grow.socials?.customWebsite, "");
        assert.equal(result.grow.socials?.twitter, "https://x.com/ok");
    });

    it("parses showSettingsLink from the checkbox", () => {
        const unchecked = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
            }),
        );
        assert.equal(unchecked.grow.showSettingsLink, false);

        const checked = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                showSettingsLink: "on",
            }),
        );
        assert.equal(checked.grow.showSettingsLink, true);
    });

    it("does not include estimatedHarvestDate when the field is omitted", () => {
        const result = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
            }),
        );
        assert.equal("estimatedHarvestDate" in (result.grow.status ?? {}), false);
    });

    it("parses growId as expectedGrowId for save CAS", () => {
        const withoutId = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
            }),
        );
        assert.equal(withoutId.expectedGrowId, undefined);

        const withId = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                growId: "grow-001",
            }),
        );
        assert.equal(withId.expectedGrowId, "grow-001");
    });
});

describe("parseStreamSettingsForm", () => {
    it("allows https stream URLs and strips unsafe schemes", () => {
        const ok = parseStreamSettingsForm(
            formFrom({
                streamUrl: "https://stream.example.com/hls/",
                showGrowName: "on",
            }),
        );
        assert.equal(ok.grow.streamUrl, "https://stream.example.com/hls/");
        assert.equal(ok.grow.showGrowName, true);

        const bad = parseStreamSettingsForm(
            formFrom({
                streamUrl: "javascript:alert(1)",
            }),
        );
        assert.equal(bad.grow.streamUrl, "");
        assert.equal(bad.grow.showGrowName, false);
    });

    it("parses overlay and identity together because overlay lives on Grow", () => {
        const result = parseStreamSettingsForm(
            formFrom({
                name: "Hijack",
                plant: "Tomato",
                streamUrl: "https://stream.example.com/hls/",
            }),
        );
        assert.equal(result.grow.name, "Hijack");
        assert.equal(result.grow.plant, "Tomato");
        assert.equal(result.grow.streamUrl, "https://stream.example.com/hls/");
    });

    it("parses overlayLayout radios with left-rail as the missing/junk default", () => {
        const missing = parseStreamSettingsForm(formFrom({}));
        assert.equal(missing.grow.overlayLayout, "left-rail");

        const junk = parseStreamSettingsForm(formFrom({overlayLayout: "wide"}));
        assert.equal(junk.grow.overlayLayout, "left-rail");

        const bar = parseStreamSettingsForm(formFrom({overlayLayout: "bottom-bar"}));
        assert.equal(bar.grow.overlayLayout, "bottom-bar");
    });

    it("parses overlayStream radios with transparent as the missing/junk default", () => {
        const missing = parseStreamSettingsForm(formFrom({}));
        assert.equal(missing.grow.overlayStream, "transparent");

        const junk = parseStreamSettingsForm(formFrom({overlayStream: "iframe"}));
        assert.equal(junk.grow.overlayStream, "transparent");

        const include = parseStreamSettingsForm(formFrom({overlayStream: "include"}));
        assert.equal(include.grow.overlayStream, "include");
    });

    it("parses overlayScalePct with 100 as the missing/junk default", () => {
        const missing = parseStreamSettingsForm(formFrom({}));
        assert.equal(missing.grow.overlayScalePct, 100);

        const snapped = parseStreamSettingsForm(formFrom({overlayScalePct: "77"}));
        assert.equal(snapped.grow.overlayScalePct, 75);
    });

    it("parses climateTick radios with plain as the missing/junk default", () => {
        const missing = parseStreamSettingsForm(formFrom({}));
        assert.equal(missing.grow.climateTick, "plain");

        const junk = parseStreamSettingsForm(formFrom({climateTick: "barrel"}));
        assert.equal(junk.grow.climateTick, "plain");

        const picker = parseStreamSettingsForm(formFrom({climateTick: "picker"}));
        assert.equal(picker.grow.climateTick, "picker");

        const devicesMissing = parseStreamSettingsForm(formFrom({}));
        assert.equal(devicesMissing.grow.devicesDesign, "icons");
        const devicesIcons = parseStreamSettingsForm(formFrom({devicesDesign: "icons"}));
        assert.equal(devicesIcons.grow.devicesDesign, "icons");
        const devicesNeedle = parseStreamSettingsForm(formFrom({devicesDesign: "needle"}));
        assert.equal(devicesNeedle.grow.devicesDesign, "needle");
        const devicesJunk = parseStreamSettingsForm(formFrom({devicesDesign: "barrel"}));
        assert.equal(devicesJunk.grow.devicesDesign, "icons");
    });
});

describe("normalizeTimelapseSettings", () => {
    it("parses quality, timezone, and length", () => {
        const result = normalizeTimelapseSettings(
            {
                timelapseQuality: "high",
                timezone: "UTC",
                timelapseLengthSeconds: 12,
            },
            DEFAULT_TIMELAPSE_SETTINGS,
        );
        assert.equal(result.timelapseQuality, "high");
        assert.equal(result.timelapseLengthSeconds, 12);
        assert.equal(result.timezone, "UTC");
    });

    it("routes invalid timelapse quality through normalizer defaults", () => {
        const result = normalizeTimelapseSettings(
            {
                timelapseQuality: "ultra-mega",
                timezone: "Not/AZone",
            },
            DEFAULT_TIMELAPSE_SETTINGS,
        );

        assert.equal(result.timelapseQuality, "medium");
        assert.equal(result.timezone, "UTC");
    });

    it("keeps unused timelapse trigger times empty so 0, 1, 2, or 3 slots work", () => {
        const one = normalizeTimelapseSettings(
            {
                time1: "08:00",
                time2: "",
                time3: "",
            },
            DEFAULT_TIMELAPSE_SETTINGS,
        );
        assert.equal(one.time1, "08:00");
        assert.equal(one.time2, "");
        assert.equal(one.time3, "");

        const none = normalizeTimelapseSettings(
            {
                time1: "",
                time2: "",
                time3: "",
            },
            DEFAULT_TIMELAPSE_SETTINGS,
        );
        assert.equal(none.time1, "");
        assert.equal(none.time2, "");
        assert.equal(none.time3, "");
    });
});
