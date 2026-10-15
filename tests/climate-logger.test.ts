import assert from "node:assert/strict";
import {chmod, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {GGS_PLUGIN_ID} from "../lib/ggs-live.ts";
import {climateDayFile} from "../lib/climate/paths.ts";
import {mergeClimatePoint, parseClimateDayFile, pruneClimateDays, writeClimateDay} from "../lib/climate/store.ts";
import {_resetClimateWriteLockForTests} from "../lib/climate/store.ts";
import {_setClimateLogListenerForTests} from "../lib/climate/log.ts";
import {
    climatePointFromIngest,
    climateSlotStartMs,
    recordClimateOnIngest,
    recordClimateOnIngestBestEffort,
} from "../lib/climate/writer.ts";
import {CLIMATE_SLOT_MS} from "../lib/climate/types.ts";

function ingest(overrides: {
    updatedAt?: string;
    tempC?: number | null;
    humidityPct?: number | null;
    co2?: number | null;
    ppfd?: number | null;
    isDay?: boolean | null;
    alarmLast?: {devType: number; alarmType: number} | null;
}) {
    return {
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud" as const,
        updatedAt: overrides.updatedAt ?? "2026-10-13T12:03:00.000Z",
        online: true,
        devices: [
            {
                serial: "90E5B1B87088",
                name: "Tent",
                prefix: "CB" as const,
                productType: "SF-GGS-CB",
                online: true,
                sensor: {
                    tempC: overrides.tempC === undefined ? 24.8 : overrides.tempC,
                    humidityPct: overrides.humidityPct === undefined ? 61.4 : overrides.humidityPct,
                    vpd: 1.18,
                    co2: overrides.co2 === undefined ? 820 : overrides.co2,
                    ppfd: overrides.ppfd === undefined ? 450 : overrides.ppfd,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                    isDay: overrides.isDay === undefined ? true : overrides.isDay,
                },
                actuators: [],
                alarmLast: overrides.alarmLast ?? null,
            },
        ],
    };
}

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-climate-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    _resetClimateWriteLockForTests();
    _setClimateLogListenerForTests();
    try {
        return await fn();
    } finally {
        _setClimateLogListenerForTests();
        _resetClimateWriteLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("climate logger", () => {
    it("replaces a point with the same timestamp and keeps a new one", () => {
        const day = {date: "2026-10-13", points: []};
        const first = {
            t: "2026-10-13T12:00:00.000Z",
            tempC: 24,
            humidityPct: 60,
            vpd: 1.1,
            co2: 800,
            ppfd: 400,
            isDay: true,
        };
        const replaced = mergeClimatePoint(day, {...first, tempC: 25});
        assert.equal(replaced.points.length, 1);
        assert.equal(replaced.points[0]?.tempC, 25);
        const added = mergeClimatePoint(replaced, {...first, t: "2026-10-13T12:05:00.000Z", tempC: 26});
        assert.equal(added.points.length, 2);
        assert.equal(added.points[1]?.tempC, 26);
    });

    it("builds a compact point from a live snapshot and skips incomplete metrics", () => {
        const point = climatePointFromIngest(ingest({}), Date.parse("2026-10-13T12:03:10.000Z"));
        assert.ok(point);
        assert.equal(point?.t, new Date(climateSlotStartMs(Date.parse("2026-10-13T12:03:00.000Z"))).toISOString());
        assert.equal(point?.co2, 820);
        assert.equal(point?.ppfd, 450);
        assert.equal(point?.isDay, true);
        assert.equal(climatePointFromIngest(ingest({tempC: null})), null);
        assert.equal(climatePointFromIngest(ingest({humidityPct: null})), null);
    });

    it("writes the 5-minute slot and replaces later samples in the same slot", async () => {
        await withTempDataDir(async () => {
            const now = Date.parse("2026-10-13T12:03:10.000Z");
            await recordClimateOnIngest(ingest({updatedAt: "2026-10-13T12:03:10.000Z", tempC: 24}), now);
            await recordClimateOnIngest(ingest({updatedAt: "2026-10-13T12:04:40.000Z", tempC: 25}), now + 90_000);
            const raw = JSON.parse(await readFile(climateDayFile("2026-10-13"), "utf8"));
            const parsed = parseClimateDayFile(raw, "2026-10-13");
            assert.equal(parsed?.points.length, 1);
            assert.equal(parsed?.points[0]?.tempC, 25);
            await recordClimateOnIngest(
                ingest({updatedAt: "2026-10-13T12:08:00.000Z", tempC: 26, isDay: false}),
                Date.parse("2026-10-13T12:08:00.000Z"),
            );
            const again = parseClimateDayFile(
                JSON.parse(await readFile(climateDayFile("2026-10-13"), "utf8")),
                "2026-10-13",
            );
            assert.equal(again?.points.length, 2);
            assert.equal(again?.points[1]?.isDay, false);
            assert.equal(CLIMATE_SLOT_MS, 5 * 60 * 1000);
        });
    });

    it("prunes day files older than the retention start", async () => {
        await withTempDataDir(async () => {
            await writeClimateDay({date: "2026-01-01", points: []});
            await writeClimateDay({date: "2026-10-13", points: []});
            const removed = await pruneClimateDays("2026-10-01");
            assert.equal(removed, 1);
            await assert.rejects(readFile(climateDayFile("2026-01-01"), "utf8"));
        });
    });

    it("leaves a corrupt day and a day with a bad point untouched", async () => {
        await withTempDataDir(async () => {
            const corruptPath = climateDayFile("2026-10-13");
            await writeClimateDay({date: "2026-10-12", points: []});
            await writeFile(corruptPath, "{", "utf8");
            const before = await readFile(corruptPath, "utf8");
            await recordClimateOnIngest(ingest({updatedAt: "2026-10-13T12:03:10.000Z"}), Date.parse("2026-10-13T12:03:10.000Z"));
            assert.equal(await readFile(corruptPath, "utf8"), before);

            const dropped = {
                date: "2026-10-14",
                points: [
                    {
                        t: "2026-10-14T12:00:00.000Z",
                        tempC: 24,
                        humidityPct: 60,
                        vpd: 1,
                        co2: 800,
                        ppfd: 400,
                        isDay: true,
                    },
                    {t: "not-a-time"},
                ],
            };
            const droppedPath = climateDayFile("2026-10-14");
            await writeFile(droppedPath, JSON.stringify(dropped), "utf8");
            await recordClimateOnIngest(ingest({updatedAt: "2026-10-14T12:05:00.000Z", tempC: 26}), Date.parse("2026-10-14T12:05:00.000Z"));
            assert.equal(await readFile(droppedPath, "utf8"), JSON.stringify(dropped));
        });
    });

    it("logs the error code when a write under an unwritable climate dir fails", async () => {
        await withTempDataDir(async () => {
            const climateRoot = path.join(process.env.GROWCAST_DATA_DIR!, "climate");
            await mkdir(climateRoot, {recursive: true});
            await chmod(climateRoot, 0o555);
            const calls: Array<{reason: string; extra: Record<string, unknown>}> = [];
            _setClimateLogListenerForTests((reason, extra) => {
                calls.push({reason, extra});
            });
            try {
                await recordClimateOnIngestBestEffort(
                    ingest({updatedAt: "2026-10-13T12:03:10.000Z"}),
                );
                const failed = calls.find((call) => call.reason === "climate_write_failed");
                assert.ok(failed, "expected climate_write_failed");
                const err = failed.extra.err as {code?: string; message?: string} | undefined;
                assert.equal(err?.code, "EACCES");
                assert.equal(typeof err?.message, "string");
                assert.ok((err?.message ?? "").length > 0);
                assert.doesNotMatch(JSON.stringify(failed.extra), /XAI_API_KEY|Bearer |password=/i);
            } finally {
                _setClimateLogListenerForTests();
                await chmod(climateRoot, 0o755);
            }
        });
    });
});
