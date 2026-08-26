import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    parseAdminSettingsForm,
    parseStreamSettingsForm,
    parseTimelapseSettingsForm,
} from "../lib/admin/parse-grow-form.ts";
import {
    saveAdminSettings,
    saveEnergyAdminSettings,
    saveTimelapseAdminSettings,
} from "../lib/admin/save-settings.ts";
import {completeCurrentGrow, listArchivedGrows} from "../lib/archives.ts";
import {getCurrentGrow, updateCurrentGrow} from "../lib/db.ts";
import {energySettingsFile} from "../lib/energy/paths.ts";
import {readEnergySettings, writeEnergySettings} from "../lib/energy/settings.ts";
import {getTimelapseSettings} from "../lib/timelapse-settings.ts";

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
    it("writes grow JSON only from the grow form", async () => {
        await withTempDataDir(async () => {
            const live = await updateCurrentGrow({
                name: "Keep Stream",
                plant: "Basil",
                streamUrl: "https://example.com/live/",
                overlayLayout: "bottom-bar",
            });
            const form = settingsForm({
                name: "Atomic Save Probe",
                plant: "Tomato",
                streamUrl: "https://example.com/stream/",
                overlayLayout: "left-rail",
                timelapseQuality: "low",
                growId: live.id,
            });

            const parsed = parseAdminSettingsForm(form);
            const result = await saveAdminSettings(parsed);

            assert.equal(result.ok, true);
            const grow = await getCurrentGrow();
            assert.equal(grow.name, "Atomic Save Probe");
            assert.equal(grow.plant, "Tomato");
            assert.equal(grow.streamUrl, "https://example.com/live/");
            assert.equal(grow.overlayLayout, "bottom-bar");
        });
    });

    it("persists overlayLayout from the stream form", async () => {
        await withTempDataDir(async () => {
            const live = await getCurrentGrow();
            assert.equal(live.overlayLayout, "left-rail");

            const parsed = parseStreamSettingsForm(
                settingsForm({
                    overlayLayout: "bottom-bar",
                    growId: live.id,
                }),
            );
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, true);
            const grow = await getCurrentGrow();
            assert.equal(grow.overlayLayout, "bottom-bar");
            assert.equal(grow.name, live.name);
        });
    });

    it("persists overlayStream from the stream form", async () => {
        await withTempDataDir(async () => {
            const live = await getCurrentGrow();
            assert.equal(live.overlayStream, "transparent");

            const parsed = parseStreamSettingsForm(
                settingsForm({
                    overlayStream: "include",
                    growId: live.id,
                }),
            );
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, true);
            const grow = await getCurrentGrow();
            assert.equal(grow.overlayStream, "include");
        });
    });

    it("persists overlayScalePct from the stream form", async () => {
        await withTempDataDir(async () => {
            const live = await getCurrentGrow();
            assert.equal(live.overlayScalePct, 100);

            const parsed = parseStreamSettingsForm(
                settingsForm({
                    overlayScalePct: "150",
                    growId: live.id,
                }),
            );
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, true);
            const grow = await getCurrentGrow();
            assert.equal(grow.overlayScalePct, 150);
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

    it("grow save does not write energy settings", async () => {
        await withTempDataDir(async () => {
            await writeEnergySettings({
                publicTariffEurPerKwh: 0.31,
                privateTariffEurPerKwh: 0.4,
                overrides: [],
            });
            const live = await getCurrentGrow();
            const parsed = parseAdminSettingsForm(
                settingsForm({
                    name: "No Energy",
                    plant: "Basil",
                    energyPublicTariff: "9.99",
                    growId: live.id,
                }),
            );
            const result = await saveAdminSettings(parsed);
            assert.equal(result.ok, true);
            const energy = await readEnergySettings();
            assert.equal(energy.publicTariffEurPerKwh, 0.31);
            assert.equal(energy.privateTariffEurPerKwh, 0.4);
        });
    });

    it("energy save does not write grow JSON", async () => {
        await withTempDataDir(async (dir) => {
            const live = await updateCurrentGrow({
                name: "Leave Me",
                plant: "Basil",
                streamUrl: "https://example.com/cam/",
            });
            const growPath = path.join(dir, "current-grow.json");
            const before = await readFile(growPath, "utf8");

            const result = await saveEnergyAdminSettings({
                publicTariffEurPerKwh: 0.22,
                privateTariffEurPerKwh: null,
                overrides: [],
            });
            assert.equal(result.ok, true);
            assert.equal(await readFile(growPath, "utf8"), before);
            assert.equal((await getCurrentGrow()).id, live.id);
            assert.equal((await getCurrentGrow()).name, "Leave Me");
            assert.equal((await readEnergySettings()).publicTariffEurPerKwh, 0.22);
            assert.equal(energySettingsFile().includes(dir), true);
        });
    });

    it("timelapse save does not write grow JSON", async () => {
        await withTempDataDir(async (dir) => {
            await updateCurrentGrow({
                name: "Leave Me",
                plant: "Basil",
                streamUrl: "",
            });
            const growPath = path.join(dir, "current-grow.json");
            const before = await readFile(growPath, "utf8");
            const parsed = parseTimelapseSettingsForm(
                settingsForm({
                    timelapseQuality: "low",
                    timelapseTimezone: "UTC",
                    timelapseLength: "8",
                    name: "Hijack",
                }),
            );
            const result = await saveTimelapseAdminSettings(parsed);
            assert.equal(result.ok, true);
            assert.equal(await readFile(growPath, "utf8"), before);
            assert.equal((await getTimelapseSettings()).timelapseQuality, "low");
            assert.equal((await getCurrentGrow()).name, "Leave Me");
        });
    });
});
