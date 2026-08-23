import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {completeCurrentGrow} from "../lib/archives.ts";
import {energyGetResponse} from "../lib/energy/http.ts";
import {writeEnergyCursor, writeEnergyDay} from "../lib/energy/store.ts";
import {writeEnergySettings} from "../lib/energy/settings.ts";
import {updateCurrentGrow} from "../lib/db.ts";
import {_resetEnergyAccrueLockForTests} from "../lib/energy/accrue.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-energy-http-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    _resetEnergyAccrueLockForTests();
    try {
        return await fn(dir);
    } finally {
        _resetEnergyAccrueLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function requestFor(grow: string): Request {
    return new Request(`http://localhost/api/data/energy?grow=${encodeURIComponent(grow)}`);
}

describe("GET /api/data/energy", () => {
    it("returns 200 for current with no serials and only the viewer tariff", async () => {
        await withTempDataDir(async () => {
            await writeEnergySettings({
                publicTariffEurPerKwh: 0.3,
                privateTariffEurPerKwh: 0.41,
                overrides: [],
            });
            await writeEnergyCursor({
                growId: "grow-001",
                startedAt: "2026-08-23T08:00:00.000Z",
                lastAccruedAt: "2026-08-23T10:00:00.000Z",
                devices: [
                    {
                        serial: "90E5B1B87088",
                        name: "Tent Controller",
                        prefix: "CB",
                        productType: "SF-GGS-CB",
                        online: true,
                        sensor: {
                            tempC: null,
                            humidityPct: null,
                            vpd: null,
                            co2: null,
                            ppfd: null,
                            tempSoilC: null,
                            humiditySoilPct: null,
                            ecSoil: null,
                        },
                        actuators: [{id: "heater", label: "Heater", kind: "heater", on: true, level: 1}],
                    },
                ],
            });
            await writeEnergyDay({
                date: "2026-08-23",
                hours: {
                    "12": {"90E5B1B87088:heater": {"1": 3600}},
                },
            });

            const publicResponse = await energyGetResponse(requestFor("current"), "public");
            assert.equal(publicResponse.status, 200);
            assert.equal(publicResponse.headers.get("cache-control"), "no-store");
            const publicBody = (await publicResponse.json()) as Record<string, unknown>;
            const publicText = JSON.stringify(publicBody);
            assert.equal(publicText.includes("90E5B1B87088"), false);
            assert.equal(publicText.includes("serial"), false);
            assert.equal(publicText.includes("privateTariff"), false);
            assert.equal(publicText.includes("publicTariff"), false);
            assert.equal(publicBody.tariffKind, "public");
            assert.equal(publicBody.appliedTariffEurPerKwh, 0.3);
            assert.equal(publicText.includes("0.41"), false);
            assert.ok(publicBody.windows);
            const series = publicBody.series as {
                today: {kind: string; points: unknown[]};
                "7d": {kind: string; points: unknown[]};
                "30d": {kind: string; points: unknown[]};
                grow: {kind: string; points: unknown[]};
            };
            assert.equal(series.today.kind, "hour");
            assert.equal(series["7d"].kind, "day");
            assert.equal(series["7d"].points.length, 7);
            assert.equal(series["30d"].points.length, 30);
            assert.ok(series.grow.points.length >= 1);

            const privateResponse = await energyGetResponse(requestFor("current"), "private");
            const privateBody = (await privateResponse.json()) as Record<string, unknown>;
            const privateText = JSON.stringify(privateBody);
            assert.equal(privateBody.tariffKind, "private");
            assert.equal(privateBody.appliedTariffEurPerKwh, 0.41);
            assert.equal(privateText.includes("\"appliedTariffEurPerKwh\":0.3"), false);
        });
    });

    it("returns 404 for an unknown archive and 200 for a known archive without windows", async () => {
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
                name: "Energy Archive",
                plant: "Basil",
                streamUrl: "",
            });
            const completed = await completeCurrentGrow(
                {
                    harvestedAt: "2026-08-23",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(completed.ok, true);
            if (!completed.ok) {
                return;
            }

            const missing = await energyGetResponse(requestFor("2026-01-01-missing"), "public");
            assert.equal(missing.status, 404);

            const found = await energyGetResponse(requestFor(completed.archive.archiveId), "public");
            assert.equal(found.status, 200);
            const body = (await found.json()) as Record<string, unknown>;
            assert.equal(body.windows, null);
            assert.equal(body.nowWatts, null);
            assert.equal(body.series, undefined);
            assert.equal("series" in body, false);
            assert.equal(JSON.stringify(body).includes("serial"), false);
        });
    });

    it("does not score leftover current/ days when the cursor is for another grow", async () => {
        await withTempDataDir(async () => {
            await writeEnergySettings({
                publicTariffEurPerKwh: 0.3,
                privateTariffEurPerKwh: null,
                overrides: [],
            });
            await writeEnergyCursor({
                growId: "grow-old",
                startedAt: "2026-08-01T00:00:00.000Z",
                lastAccruedAt: "2026-08-23T10:00:00.000Z",
                devices: [],
            });
            await writeEnergyDay({
                date: "2026-08-23",
                hours: {"12": {"90E5B1B87088:heater": {"10": 3600}}},
            });
            const response = await energyGetResponse(requestFor("current"), "public");
            const body = (await response.json()) as {kWh: number};
            assert.equal(body.kWh, 0);
        });
    });

    it("scores an archive from frozen seconds without a live snapshot", async () => {
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
                name: "Frozen Watts",
                plant: "Basil",
                streamUrl: "",
            });
            await writeEnergyCursor({
                growId: live.id,
                startedAt: "2026-08-01T00:00:00.000Z",
                lastAccruedAt: "2026-08-23T10:00:00.000Z",
                devices: [],
            });
            await writeEnergyDay({
                date: "2026-08-23",
                hours: {"12": {"90E5B1B87088:heater": {"10": 3600}}},
            });
            const completed = await completeCurrentGrow(
                {
                    harvestedAt: "2026-08-23",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(completed.ok, true);
            if (!completed.ok) {
                return;
            }
            const response = await energyGetResponse(
                requestFor(completed.archive.archiveId),
                "public",
            );
            const body = (await response.json()) as {kWh: number; windows: unknown};
            assert.equal(body.windows, null);
            assert.equal(body.kWh, 0.5);
        });
    });

    it("returns null costEur when the viewer tariff is unset", async () => {
        await withTempDataDir(async () => {
            const response = await energyGetResponse(requestFor("current"), "public");
            assert.equal(response.status, 200);
            const body = (await response.json()) as Record<string, unknown>;
            assert.equal(body.costEur, null);
            assert.equal(body.appliedTariffEurPerKwh, null);
        });
    });
});
