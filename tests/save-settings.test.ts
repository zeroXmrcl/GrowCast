import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {parseAdminSettingsForm} from "../lib/admin/parse-grow-form.ts";
import {saveAdminSettings} from "../lib/admin/save-settings.ts";

describe("saveAdminSettings orchestration", () => {
    it("returns a structured result shape for a successful dual write path", async () => {
        // Drive the real parse → save path against local data files.
        // This verifies the shipped orchestration entry (not a mock).
        const form = new FormData();
        form.set("name", "Atomic Save Probe");
        form.set("plant", "Tomato");
        form.set("streamUrl", "https://example.com/stream/");
        form.set("timelapseQuality", "low");
        form.set("timelapseTimezone", "UTC");
        form.set("timelapseLength", "8");

        const parsed = parseAdminSettingsForm(form);
        const result = await saveAdminSettings(parsed);

        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.grow.name, "Atomic Save Probe");
            assert.equal(result.grow.streamUrl, "https://example.com/stream/");
            assert.equal(result.timelapse.timelapseQuality, "low");
            assert.equal(result.timelapse.timelapseLengthSeconds, 8);
        }
    });
});
