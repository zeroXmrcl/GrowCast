import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {parseAdminSettingsForm} from "../lib/admin/parse-grow-form.ts";
import {saveAdminSettings} from "../lib/admin/save-settings.ts";
import {completeCurrentGrow, listArchivedGrows} from "../lib/archives.ts";
import {getTimelapseSettings} from "../lib/timelapse-settings.ts";
import {getCurrentGrow, updateCurrentGrow} from "../lib/db.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-save-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function settingsForm(entries: Record<string, string>): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(entries)) {
        form.set(key, value);
    }
    return form;
}

describe("saveAdminSettings orchestration", () => {
    it("returns a structured result shape for a successful dual write path", async () => {
        await withTempDataDir(async () => {
            const live = await getCurrentGrow();
            const form = settingsForm({
                name: "Atomic Save Probe",
                plant: "Tomato",
                streamUrl: "https://example.com/stream/",
                timelapseQuality: "low",
                timelapseTimezone: "UTC",
                timelapseLength: "8",
                growId: live.id,
            });

            const parsed = parseAdminSettingsForm(form);
            const result = await saveAdminSettings(parsed);

            assert.equal(result.ok, true);
            if (result.ok) {
                assert.equal(result.grow.name, "Atomic Save Probe");
                assert.equal(result.grow.streamUrl, "https://example.com/stream/");
                assert.equal(result.grow.overlayLayout, "left-rail");
                assert.equal(result.timelapse.timelapseQuality, "low");
                assert.equal(result.timelapse.timelapseLengthSeconds, 8);
            }
        });
    });

    it("persists overlayLayout from the settings form", async () => {
        await withTempDataDir(async () => {
            const live = await getCurrentGrow();
            assert.equal(live.overlayLayout, "left-rail");

            const parsed = parseAdminSettingsForm(
                settingsForm({
                    name: "Overlay Save",
                    plant: "Basil",
                    overlayLayout: "bottom-bar",
                    growId: live.id,
                    timelapseQuality: "medium",
                    timelapseTimezone: "UTC",
                    timelapseLength: "8",
                }),
            );
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, true);
            const grow = await getCurrentGrow();
            assert.equal(grow.overlayLayout, "bottom-bar");
            assert.equal(grow.name, "Overlay Save");
        });
    });

    it("does not wipe estimatedHarvestDate when the date field is omitted from FormData", async () => {
        await withTempDataDir(async () => {
            const live = await updateCurrentGrow({
                name: "Keep Harvest",
                plant: "Basil",
                streamUrl: "",
                status: {estimatedHarvestDate: "2026-09-01", health: "Healthy"},
            });

            const form = settingsForm({
                name: "Keep Harvest",
                plant: "Basil",
                health: "Warning",
                growId: live.id,
            });
            const parsed = parseAdminSettingsForm(form);
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, true);
            const grow = await getCurrentGrow();
            assert.equal(grow.status.estimatedHarvestDate, "2026-09-01");
            assert.equal(grow.status.health, "Warning");
        });
    });

    it("rejects a save without a grow id instead of writing", async () => {
        await withTempDataDir(async () => {
            await updateCurrentGrow({
                name: "Live Grow",
                plant: "Basil",
                streamUrl: "",
            });

            const parsed = parseAdminSettingsForm(
                settingsForm({
                    name: "Hijacked Name",
                    plant: "Tomato",
                }),
            );
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.error, "stale_grow");
            }
            const grow = await getCurrentGrow();
            assert.equal(grow.name, "Live Grow");
            assert.equal(grow.plant, "Basil");
        });
    });

    it("rejects a stale save after complete and does not revive the archived grow", async () => {
        await withTempDataDir(async (root) => {
            const sources = {
                snapshotsDir: path.join(root, "snapshots"),
                timelapseDir: path.join(root, "timelapse"),
                picturesDir: path.join(root, "pictures"),
            };
            await mkdir(sources.snapshotsDir, {recursive: true});
            await mkdir(sources.timelapseDir, {recursive: true});
            await mkdir(sources.picturesDir, {recursive: true});

            const live = await updateCurrentGrow({
                name: "Harvested Strain",
                plant: "Cannabis",
                streamUrl: "",
                details: {
                    strain: "Old Notes",
                    stage: "Drying",
                    seededAt: "2026-01-01",
                    lightSchedule: "12/12",
                    notes: "keep me",
                },
            });

            const staleForm = settingsForm({
                name: "Harvested Strain",
                plant: "Cannabis",
                strain: "Old Notes",
                notes: "revived content",
                growId: live.id,
                timelapseQuality: "medium",
                timelapseTimezone: "UTC",
                timelapseLength: "8",
            });

            const completed = await completeCurrentGrow(
                {
                    harvestedAt: "2026-04-20",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(completed.ok, true);

            const parsed = parseAdminSettingsForm(staleForm);
            assert.equal(parsed.expectedGrowId, live.id);
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.error, "stale_grow");
            }

            const current = await getCurrentGrow();
            assert.equal(current.name, "New Grow");
            assert.notEqual(current.id, live.id);
            assert.notEqual(current.details.notes, "revived content");
            assert.equal((await listArchivedGrows()).length, 1);
        });
    });

    it("rolls back showSettingsLink when the timelapse write fails", async () => {
        await withTempDataDir(async (dir) => {
            const live = await updateCurrentGrow({
                name: "Link Rollback",
                plant: "Basil",
                streamUrl: "",
                showSettingsLink: false,
            });
            assert.equal(live.showSettingsLink, false);
            await getTimelapseSettings();

            const settingsPath = path.join(dir, "mesh", "growcast.timelapse.json");
            await rm(settingsPath);
            await mkdir(settingsPath);

            const form = settingsForm({
                name: "Link Rollback",
                plant: "Basil",
                showSettingsLink: "on",
                growId: live.id,
                timelapseQuality: "medium",
                timelapseTimezone: "UTC",
                timelapseLength: "8",
            });
            const parsed = parseAdminSettingsForm(form);
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, false);
            const grow = await getCurrentGrow();
            assert.equal(grow.showSettingsLink, false);
            assert.equal(grow.name, "Link Rollback");
        });
    });
});
