import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {parseAdminSettingsForm} from "../lib/admin/parse-grow-form.ts";

function formFrom(entries: Record<string, string>): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(entries)) {
        form.set(key, value);
    }
    return form;
}

describe("parseAdminSettingsForm", () => {
    it("allows https stream and social URLs", () => {
        const result = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                streamUrl: "https://stream.example.com/hls/",
                youtube: "https://www.youtube.com/@example",
                timelapseQuality: "high",
                timelapseTimezone: "UTC",
                timelapseLength: "12",
            }),
        );

        assert.equal(result.grow.streamUrl, "https://stream.example.com/hls/");
        assert.equal(result.grow.socials?.youtube, "https://www.youtube.com/@example");
        assert.equal(result.timelapse.timelapseQuality, "high");
        assert.equal(result.timelapse.timelapseLengthSeconds, 12);
    });

    it("strips javascript: and data: URL schemes", () => {
        const result = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                streamUrl: "javascript:alert(1)",
                customWebsite: "data:text/html,hi",
                twitter: "https://x.com/ok",
            }),
        );

        assert.equal(result.grow.streamUrl, "");
        assert.equal(result.grow.socials?.customWebsite, "");
        assert.equal(result.grow.socials?.twitter, "https://x.com/ok");
    });

    it("routes invalid timelapse quality through normalizer defaults", () => {
        const result = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                timelapseQuality: "ultra-mega",
                timelapseTimezone: "Not/AZone",
            }),
        );

        assert.equal(result.timelapse.timelapseQuality, "medium");
        assert.equal(result.timelapse.timezone, "UTC");
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

    it("keeps unused timelapse trigger times empty so 0, 1, 2, or 3 slots work", () => {
        const one = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                timelapseTime1: "08:00",
                timelapseTime2: "",
                timelapseTime3: "",
            }),
        );
        assert.equal(one.timelapse.time1, "08:00");
        assert.equal(one.timelapse.time2, "");
        assert.equal(one.timelapse.time3, "");

        const none = parseAdminSettingsForm(
            formFrom({
                name: "Test Grow",
                plant: "Tomato",
                timelapseTime1: "",
                timelapseTime2: "",
                timelapseTime3: "",
            }),
        );
        assert.equal(none.timelapse.time1, "");
        assert.equal(none.timelapse.time2, "");
        assert.equal(none.timelapse.time3, "");
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
