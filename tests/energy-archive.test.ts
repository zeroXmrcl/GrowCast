import assert from "node:assert/strict";
import {access, mkdir, mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {completeCurrentGrow, listArchivedGrows} from "../lib/archives.ts";
import {energyCurrentDir, energyCursorFile} from "../lib/energy/paths.ts";
import {getCurrentGrow, updateCurrentGrow} from "../lib/db.ts";
import {_resetEnergyAccrueLockForTests} from "../lib/energy/accrue.ts";
import {_resetGrowWriteLockForTests} from "../lib/grow-write-lock.ts";

async function withTempEnv<T>(
    fn: (env: {
        root: string;
        sources: {snapshotsDir: string; timelapseDir: string; picturesDir: string};
    }) => Promise<T>,
): Promise<T> {
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-energy-archive-"));
    const dataDir = path.join(root, "data");
    const sources = {
        snapshotsDir: path.join(root, "snapshots"),
        timelapseDir: path.join(root, "timelapse"),
        picturesDir: path.join(root, "pictures"),
    };
    await mkdir(dataDir, {recursive: true});
    await mkdir(sources.snapshotsDir, {recursive: true});
    await mkdir(sources.timelapseDir, {recursive: true});
    await mkdir(sources.picturesDir, {recursive: true});
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dataDir;
    _resetEnergyAccrueLockForTests();
    _resetGrowWriteLockForTests();
    try {
        return await fn({root, sources});
    } finally {
        _resetEnergyAccrueLockForTests();
        _resetGrowWriteLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(root, {recursive: true, force: true});
    }
}

describe("complete grow energy archive", () => {
    it("copies current energy then resets current/", async () => {
        await withTempEnv(async ({sources}) => {
            const live = await updateCurrentGrow({
                name: "Energy Run",
                plant: "Basil",
                streamUrl: "",
            });
            await mkdir(energyCurrentDir(), {recursive: true});
            await writeFile(
                energyCursorFile(),
                JSON.stringify({
                    growId: live.id,
                    startedAt: "2026-08-01T00:00:00.000Z",
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
                            actuators: [
                                {id: "heater", label: "Heater", kind: "heater", on: true, level: 10},
                            ],
                        },
                    ],
                }),
                "utf8",
            );
            await writeFile(
                path.join(energyCurrentDir(), "2026-08-23.json"),
                JSON.stringify({
                    date: "2026-08-23",
                    hours: {"12": {"90E5B1B87088:heater": {"10": 3600}}},
                }),
                "utf8",
            );

            const result = await completeCurrentGrow(
                {
                    harvestedAt: "2026-08-23",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }

            const archived = JSON.parse(
                await readFile(
                    path.join(process.env.GROWCAST_DATA_DIR!, "archives", result.archive.archiveId, "energy.json"),
                    "utf8",
                ),
            ) as {
                version: number;
                growId: string;
                days: Record<string, {hours: Record<string, unknown>}>;
                devices?: Array<{actuators?: Array<{kind?: string}>}>;
                kWh?: unknown;
                costEur?: unknown;
            };
            assert.equal(archived.version, 1);
            assert.equal(archived.growId, live.id);
            assert.equal(archived.kWh, undefined);
            assert.equal(archived.costEur, undefined);
            assert.equal(archived.days["2026-08-23"]?.hours["12"]["90E5B1B87088:heater"]["10"], 3600);
            assert.equal(archived.devices?.[0]?.actuators?.[0]?.kind, "heater");

            const currentEntries = await readdir(energyCurrentDir());
            assert.equal(currentEntries.includes("cursor.json"), false);
            assert.equal(currentEntries.some((name) => name.endsWith(".json")), false);
        });
    });

    it("still completes when energy current/ is empty", async () => {
        await withTempEnv(async ({sources}) => {
            const live = await updateCurrentGrow({
                name: "Empty Energy",
                plant: "Basil",
                streamUrl: "",
            });
            const result = await completeCurrentGrow(
                {
                    harvestedAt: "2026-08-23",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            const archived = JSON.parse(
                await readFile(
                    path.join(process.env.GROWCAST_DATA_DIR!, "archives", result.archive.archiveId, "energy.json"),
                    "utf8",
                ),
            ) as {days: Record<string, unknown>};
            assert.deepEqual(archived.days, {});
        });
    });

    it("fails complete and leaves current/ when a day file is corrupt", async () => {
        await withTempEnv(async ({sources}) => {
            const live = await updateCurrentGrow({
                name: "CopyFail",
                plant: "Basil",
                streamUrl: "",
            });
            await mkdir(energyCurrentDir(), {recursive: true});
            await writeFile(
                energyCursorFile(),
                JSON.stringify({
                    growId: live.id,
                    startedAt: "2026-08-01T00:00:00.000Z",
                    lastAccruedAt: "2026-08-23T10:00:00.000Z",
                    devices: [],
                }),
                "utf8",
            );
            await writeFile(path.join(energyCurrentDir(), "2026-08-23.json"), "{not-json", "utf8");

            const result = await completeCurrentGrow(
                {
                    harvestedAt: "2026-08-23",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.error, "energy_copy_failed");
            }
            await access(energyCursorFile());
            assert.deepEqual(await listArchivedGrows(), []);
            const current = await readFile(energyCursorFile(), "utf8");
            assert.ok(current.includes(live.id));
            assert.equal(await readFile(path.join(energyCurrentDir(), "2026-08-23.json"), "utf8"), "{not-json");
        });
    });

    it("fails complete and leaves current/ when day files exist without a matching cursor", async () => {
        await withTempEnv(async ({sources}) => {
            const live = await updateCurrentGrow({
                name: "Orphan Days",
                plant: "Basil",
                streamUrl: "",
            });
            await mkdir(energyCurrentDir(), {recursive: true});
            await writeFile(
                path.join(energyCurrentDir(), "2026-08-23.json"),
                JSON.stringify({
                    date: "2026-08-23",
                    hours: {"12": {"90E5B1B87088:heater": {"10": 3600}}},
                }),
                "utf8",
            );

            const result = await completeCurrentGrow(
                {
                    harvestedAt: "2026-08-23",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.error, "energy_copy_failed");
            }
            assert.deepEqual(await listArchivedGrows(), []);
            assert.equal((await getCurrentGrow()).id, live.id);
            const day = JSON.parse(
                await readFile(path.join(energyCurrentDir(), "2026-08-23.json"), "utf8"),
            ) as {hours: Record<string, Record<string, Record<string, number>>>};
            assert.equal(day.hours["12"]["90E5B1B87088:heater"]["10"], 3600);
        });
    });
});
