import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, it} from "node:test";
import {
    ENERGY_ACCRUE_GAP_MS,
    _resetEnergyAccrueLockForTests,
    accrueEnergyOnIngest,
    eventTimeMs,
    persistAccruePlan,
    planAccrue,
} from "../lib/energy/accrue.ts";
import {energyCurrentDir, energyCursorFile, energyDayFile} from "../lib/energy/paths.ts";
import {
    _failEnergyDayWriteOnCallForTests,
    _failNextEnergyCursorWriteForTests,
    _resetEnergyStoreForTests,
    readEnergyCursor,
    readEnergyDay,
    writeEnergyCursor,
    writeEnergyDay,
} from "../lib/energy/store.ts";
import {GGS_FUTURE_SKEW_MS, GGS_PLUGIN_ID, parseIngestBody} from "../lib/ggs-live.ts";
import {
    _resetIngestRateForTests,
    liveClimateIngestResponse,
} from "../lib/ggs-live-http.ts";
import {_resetMeshAuthThrottleForTests} from "../lib/mesh-throttle.ts";
import {berlinHour, splitBerlinHours} from "../lib/energy/berlin.ts";
import type {GgsDeviceSnapshot} from "../lib/ggs-live.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-energy-accrue-"));
    const previousDir = process.env.GROWCAST_DATA_DIR;
    const previousToken = process.env.GROWCAST_MESH_TOKEN;
    process.env.GROWCAST_DATA_DIR = dir;
    process.env.GROWCAST_MESH_TOKEN = "test-mesh-token";
    _resetEnergyAccrueLockForTests();
    _resetEnergyStoreForTests();
    _resetIngestRateForTests();
    _resetMeshAuthThrottleForTests();
    try {
        return await fn(dir);
    } finally {
        _resetEnergyAccrueLockForTests();
        _resetEnergyStoreForTests();
        _resetIngestRateForTests();
        _resetMeshAuthThrottleForTests();
        if (previousDir === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previousDir;
        }
        if (previousToken === undefined) {
            delete process.env.GROWCAST_MESH_TOKEN;
        } else {
            process.env.GROWCAST_MESH_TOKEN = previousToken;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function heaterDevice(on: boolean, level: number | null): GgsDeviceSnapshot {
    return {
        serial: "90E5B1B87088",
        name: "SF-GGS-CB-7088",
        prefix: "CB",
        productType: "SF-GGS-CB",
        online: true,
        sensor: {
            tempC: 25,
            humidityPct: 50,
            vpd: 1,
            co2: null,
            ppfd: null,
            tempSoilC: null,
            humiditySoilPct: null,
            ecSoil: null,
        },
        actuators: [{id: "heater", label: "Heater", kind: "heater", on, level}],
    };
}

function ingestBody(updatedAt: string, on: boolean, level: number | null) {
    return {
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud",
        updatedAt,
        online: true,
        devices: [heaterDevice(on, level)],
    };
}

function ingestRequest(body: unknown, token = "test-mesh-token"): Request {
    return new Request("http://localhost/api/mesh/growcast.ggs/state", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

afterEach(() => {
    _resetEnergyAccrueLockForTests();
    _resetEnergyStoreForTests();
    _resetIngestRateForTests();
    _resetMeshAuthThrottleForTests();
});

describe("planAccrue", () => {
    const t1 = Date.parse("2026-08-23T10:00:00.000Z");
    const t2 = t1 + 60_000;

    it("inits a cursor and accrues 0 on first snapshot", () => {
        const plan = planAccrue({
            cursor: null,
            currentGrowId: "grow-001",
            eventTimeMs: t1,
            newDevices: [heaterDevice(true, 1)],
        });
        assert.equal(plan.kind, "init");
        if (plan.kind === "init") {
            assert.equal(plan.cursor.growId, "grow-001");
            assert.equal(plan.cursor.lastAccruedAt, new Date(t1).toISOString());
        }
    });

    it("does not accrue off actuators", () => {
        const plan = planAccrue({
            cursor: {
                growId: "grow-001",
                startedAt: new Date(t1).toISOString(),
                lastAccruedAt: new Date(t1).toISOString(),
                devices: [heaterDevice(false, 1)],
            },
            currentGrowId: "grow-001",
            eventTimeMs: t2,
            newDevices: [heaterDevice(true, 1)],
        });
        assert.equal(plan.kind, "advance");
        if (plan.kind === "advance") {
            assert.equal(plan.additions.length, 0);
            assert.equal(plan.paused, false);
        }
    });

    it("accrues on gear 1 as raw level string seconds", () => {
        const plan = planAccrue({
            cursor: {
                growId: "grow-001",
                startedAt: new Date(t1).toISOString(),
                lastAccruedAt: new Date(t1).toISOString(),
                devices: [heaterDevice(true, 1)],
            },
            currentGrowId: "grow-001",
            eventTimeMs: t2,
            newDevices: [heaterDevice(true, 2)],
        });
        assert.equal(plan.kind, "advance");
        if (plan.kind === "advance") {
            assert.ok(plan.additions.length > 0);
            assert.ok(plan.additions.every((item) => item.level === "1"));
            assert.ok(plan.additions.every((item) => item.key === "90E5B1B87088:heater"));
            const seconds = plan.additions.reduce((sum, item) => sum + item.seconds, 0);
            assert.equal(seconds, 60);
        }
    });

    it("skips a missing level instead of inventing a mode", () => {
        const plan = planAccrue({
            cursor: {
                growId: "grow-001",
                startedAt: new Date(t1).toISOString(),
                lastAccruedAt: new Date(t1).toISOString(),
                devices: [heaterDevice(true, null)],
            },
            currentGrowId: "grow-001",
            eventTimeMs: t2,
            newDevices: [heaterDevice(true, 1)],
        });
        assert.equal(plan.kind, "advance");
        if (plan.kind === "advance") {
            assert.equal(plan.additions.length, 0);
        }
    });

    it("pauses across a >15 minute gap and still advances the cursor", () => {
        const later = t1 + ENERGY_ACCRUE_GAP_MS + 1_000;
        const plan = planAccrue({
            cursor: {
                growId: "grow-001",
                startedAt: new Date(t1).toISOString(),
                lastAccruedAt: new Date(t1).toISOString(),
                devices: [heaterDevice(true, 1)],
            },
            currentGrowId: "grow-001",
            eventTimeMs: later,
            newDevices: [heaterDevice(true, 1)],
        });
        assert.equal(plan.kind, "advance");
        if (plan.kind === "advance") {
            assert.equal(plan.paused, true);
            assert.deepEqual(plan.additions, []);
            assert.equal(plan.cursor.lastAccruedAt, new Date(later).toISOString());
        }
    });

    it("does not write when cursor growId mismatches the current grow", () => {
        const plan = planAccrue({
            cursor: {
                growId: "grow-old",
                startedAt: new Date(t1).toISOString(),
                lastAccruedAt: new Date(t1).toISOString(),
                devices: [heaterDevice(true, 1)],
            },
            currentGrowId: "grow-001",
            eventTimeMs: t2,
            newDevices: [heaterDevice(true, 1)],
        });
        assert.equal(plan.kind, "skip");
    });
});

describe("Berlin hour split", () => {
    it("splits a delta across Berlin midnight, not UTC hours", () => {
        const t1 = Date.parse("2026-08-22T21:59:00.000Z");
        const t2 = Date.parse("2026-08-22T22:01:00.000Z");
        const slices = splitBerlinHours(t1, t2);
        assert.deepEqual(
            slices.map((slice) => ({date: slice.date, hour: slice.hour, seconds: slice.seconds})),
            [
                {date: "2026-08-22", hour: 23, seconds: 60},
                {date: "2026-08-23", hour: 0, seconds: 60},
            ],
        );
        assert.notEqual(new Date(t1).getUTCHours(), 23);
    });

    it("skips the missing Berlin hour on spring-forward", () => {
        const t1 = Date.parse("2026-03-29T00:30:00.000Z");
        const t2 = Date.parse("2026-03-29T01:30:00.000Z");
        const slices = splitBerlinHours(t1, t2);
        assert.deepEqual(
            slices.map((slice) => slice.hour),
            [1, 3],
        );
        assert.ok(!slices.some((slice) => slice.hour === 2));
    });
});

describe("event time", () => {
    it("falls back to server now when updatedAt is too far in the future", () => {
        const now = Date.parse("2026-08-23T12:00:00.000Z");
        const future = new Date(now + GGS_FUTURE_SKEW_MS + 1).toISOString();
        assert.equal(eventTimeMs(future, now), now);
        assert.equal(eventTimeMs("2026-08-23T12:00:01.000Z", now), Date.parse("2026-08-23T12:00:01.000Z"));
    });
});

describe("persistAccruePlan", () => {
    it("writes heater gear 1 seconds into the Berlin hour bucket", async () => {
        await withTempDataDir(async () => {
            const t1 = Date.parse("2026-08-23T10:00:00.000Z");
            const t2 = t1 + 600_000;
            const plan = planAccrue({
                cursor: {
                    growId: "grow-001",
                    startedAt: new Date(t1).toISOString(),
                    lastAccruedAt: new Date(t1).toISOString(),
                    devices: [heaterDevice(true, 1)],
                },
                currentGrowId: "grow-001",
                eventTimeMs: t2,
                newDevices: [heaterDevice(true, 1)],
            });
            await persistAccruePlan(plan);
            const day = await readEnergyDay("2026-08-23");
            assert.ok(day);
            assert.equal(day.hours[String(berlinHour(t1))]["90E5B1B87088:heater"]["1"], 600);
        });
    });

    it("rolls back the first day file if a later day write fails", async () => {
        await withTempDataDir(async () => {
            const t1 = Date.parse("2026-08-22T21:59:00.000Z");
            const startedAt = new Date(t1).toISOString();
            await writeEnergyCursor({
                growId: "grow-001",
                startedAt,
                lastAccruedAt: startedAt,
                devices: [heaterDevice(true, 1)],
            });
            await writeEnergyDay({
                date: "2026-08-22",
                hours: {"23": {"90E5B1B87088:heater": {"1": 100}}},
            });
            _failEnergyDayWriteOnCallForTests(2);

            const plan = planAccrue({
                cursor: {
                    growId: "grow-001",
                    startedAt,
                    lastAccruedAt: startedAt,
                    devices: [heaterDevice(true, 1)],
                },
                currentGrowId: "grow-001",
                eventTimeMs: t1 + 120_000,
                newDevices: [heaterDevice(true, 1)],
            });
            await persistAccruePlan(plan);

            const day = await readEnergyDay("2026-08-22");
            assert.equal(day?.hours["23"]["90E5B1B87088:heater"]["1"], 100);
            const cursor = await readEnergyCursor();
            assert.equal(cursor?.lastAccruedAt, startedAt);
        });
    });

    it("rolls back day files if the cursor write fails", async () => {
        await withTempDataDir(async () => {
            const t1 = Date.parse("2026-08-23T10:00:00.000Z");
            const startedAt = new Date(t1).toISOString();
            await writeEnergyCursor({
                growId: "grow-001",
                startedAt,
                lastAccruedAt: startedAt,
                devices: [heaterDevice(true, 1)],
            });
            await writeEnergyDay({
                date: "2026-08-23",
                hours: {"12": {"90E5B1B87088:heater": {"1": 100}}},
            });
            _failNextEnergyCursorWriteForTests();
            const plan = planAccrue({
                cursor: {
                    growId: "grow-001",
                    startedAt,
                    lastAccruedAt: startedAt,
                    devices: [heaterDevice(true, 1)],
                },
                currentGrowId: "grow-001",
                eventTimeMs: t1 + 60_000,
                newDevices: [heaterDevice(true, 1)],
            });
            await persistAccruePlan(plan);
            const day = await readEnergyDay("2026-08-23");
            assert.equal(day?.hours[String(berlinHour(t1))]["90E5B1B87088:heater"]["1"], 100);
            const cursor = await readEnergyCursor();
            assert.equal(cursor?.lastAccruedAt, startedAt);
        });
    });

    it("leaves a corrupt day file in place and does not advance the cursor", async () => {
        await withTempDataDir(async () => {
            const t1 = Date.parse("2026-08-23T10:00:00.000Z");
            const startedAt = new Date(t1).toISOString();
            await writeEnergyCursor({
                growId: "grow-001",
                startedAt,
                lastAccruedAt: startedAt,
                devices: [heaterDevice(true, 1)],
            });
            await mkdir(energyCurrentDir(), {recursive: true});
            await writeFile(energyDayFile("2026-08-23"), "{not-json", "utf8");

            const plan = planAccrue({
                cursor: {
                    growId: "grow-001",
                    startedAt,
                    lastAccruedAt: startedAt,
                    devices: [heaterDevice(true, 1)],
                },
                currentGrowId: "grow-001",
                eventTimeMs: t1 + 60_000,
                newDevices: [heaterDevice(true, 1)],
            });
            await persistAccruePlan(plan);

            assert.equal(await readFile(energyDayFile("2026-08-23"), "utf8"), "{not-json");
            const cursor = await readEnergyCursor();
            assert.equal(cursor?.lastAccruedAt, startedAt);
        });
    });
});

describe("ingest accrue hook", () => {
    it("does not accrue on 429 or 401", async () => {
        await withTempDataDir(async (dir) => {
            const first = await liveClimateIngestResponse(
                ingestRequest(ingestBody(new Date().toISOString(), true, 1)),
                GGS_PLUGIN_ID,
            );
            assert.equal(first.status, 204);
            const cursorAfterFirst = await readEnergyCursor();
            assert.ok(cursorAfterFirst);

            const limited = await liveClimateIngestResponse(
                ingestRequest(ingestBody(new Date().toISOString(), true, 1)),
                GGS_PLUGIN_ID,
            );
            assert.equal(limited.status, 429);
            const cursorAfter429 = await readEnergyCursor();
            assert.equal(cursorAfter429?.lastAccruedAt, cursorAfterFirst?.lastAccruedAt);

            const unauthorized = await liveClimateIngestResponse(
                ingestRequest(ingestBody(new Date().toISOString(), true, 1), "wrong"),
                GGS_PLUGIN_ID,
            );
            assert.equal(unauthorized.status, 401);
            const cursorAfter401 = await readEnergyCursor();
            assert.equal(cursorAfter401?.lastAccruedAt, cursorAfterFirst?.lastAccruedAt);

            const days = await readFile(energyCursorFile(), "utf8");
            assert.ok(days.includes("grow-"));
            void dir;
        });
    });

    it("replaces a leftover cursor from another grow instead of skipping forever", async () => {
        await withTempDataDir(async () => {
            await writeEnergyCursor({
                growId: "grow-old",
                startedAt: "2026-08-01T00:00:00.000Z",
                lastAccruedAt: "2026-08-23T10:00:00.000Z",
                devices: [heaterDevice(true, 1)],
            });
            await writeEnergyDay({
                date: "2026-08-22",
                hours: {"12": {"90E5B1B87088:heater": {"1": 3600}}},
            });
            const parsed = parseIngestBody(ingestBody("2026-08-23T12:00:00.000Z", true, 1));
            assert.equal(parsed.ok, true);
            if (!parsed.ok) {
                return;
            }
            await accrueEnergyOnIngest(parsed.value);
            const cursor = await readEnergyCursor();
            assert.ok(cursor);
            assert.notEqual(cursor.growId, "grow-old");
            assert.equal(cursor.lastAccruedAt, "2026-08-23T12:00:00.000Z");
            const leftover = await readEnergyDay("2026-08-22");
            assert.equal(leftover, null);
        });
    });

    it("writes a cursor and 0 seconds on the first successful ingest", async () => {
        await withTempDataDir(async () => {
            const parsed = parseIngestBody(ingestBody("2026-08-23T10:00:00.000Z", true, 1));
            assert.equal(parsed.ok, true);
            if (!parsed.ok) {
                return;
            }
            await accrueEnergyOnIngest(parsed.value);
            const cursor = await readEnergyCursor();
            assert.ok(cursor);
            assert.equal(cursor.lastAccruedAt, "2026-08-23T10:00:00.000Z");
            try {
                await readFile(energyDayFile("2026-08-23"), "utf8");
                assert.fail("first ingest should not write buckets");
            } catch (error) {
                assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
            }
        });
    });
});
