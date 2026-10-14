import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {deriveGrowPhase, stageContextFromGrow} from "../lib/ai-summary/stage.ts";
import {aggregateClimateWindow, percentile, summarizeValues} from "../lib/ai-summary/stats.ts";
import {buildMosaic, cellForValue} from "../lib/ai-summary/mosaic.ts";
import {extractJsonObject, parseAiSummaryPayload} from "../lib/ai-summary/schema.ts";
import {buildAiSummaryUserPrompt, promptContainsForbiddenTargets} from "../lib/ai-summary/prompt.ts";
import {isAiSummaryDue, tryHoldLeaderLease} from "../lib/ai-summary/scheduler.ts";
import {toPublicAiSummary} from "../lib/ai-summary/public.ts";
import {parseAiSummaryRecord, writeAiSummaryRecord, _resetAiSummaryLockForTests} from "../lib/ai-summary/store.ts";
import {allowAiSummaryRegenerate, _resetAiSummaryRateLimitForTests} from "../lib/ai-summary/rate-limit.ts";
import {generateDailyAiSummary} from "../lib/ai-summary/generate.ts";
import {requestGrowSummary, XAI_MAX_OUTPUT_TOKENS} from "../lib/ai-summary/client.ts";
import {reserveAiApiCall, readAiApiUsage} from "../lib/ai-summary/usage.ts";
import {buildMockMosaic} from "../lib/ai-summary/mock.ts";
import {AI_SUMMARY_DAILY_API_CAP, AI_SUMMARY_MOSAIC_SLOTS} from "../lib/ai-summary/types.ts";
import {completeCurrentGrow} from "../lib/archives.ts";
import {updateCurrentGrow} from "../lib/db.ts";
import {_resetGrowWriteLockForTests} from "../lib/grow-write-lock.ts";
import {_resetEnergyAccrueLockForTests} from "../lib/energy/accrue.ts";
import {writeClimateDay} from "../lib/climate/store.ts";
import type {AiSummaryRecord, ClimateWindowStats, SchedulerState, StageContext} from "../lib/ai-summary/types.ts";
import type {ClimatePoint} from "../lib/climate/types.ts";

function emptyStats(): ClimateWindowStats {
    const metric = {
        all: {count: 0, min: null, max: null, avg: null, p10: null, p50: null, p90: null, trend: null},
        day: {count: 0, min: null, max: null, avg: null, p10: null, p50: null, p90: null, trend: null},
        night: {count: 0, min: null, max: null, avg: null, p10: null, p50: null, p90: null, trend: null},
    };
    return {
        windowStart: "2026-10-13T08:00:00.000Z",
        windowEnd: "2026-10-14T08:00:00.000Z",
        pointCount: 0,
        dayPointCount: 0,
        nightPointCount: 0,
        unknownDayPointCount: 0,
        lightHours: null,
        alarmCount: 0,
        metrics: {
            tempC: metric,
            humidityPct: metric,
            vpd: metric,
            co2: metric,
            ppfd: metric,
        },
    };
}

function validAi() {
    const range = {min: 20, max: 28};
    const verdict = {verdict: "in_range" as const, pctInRange: 90, note: "on target"};
    return {
        score: 82,
        rating: "good",
        headline: "Stable veg climate",
        summary: "Temperature and VPD fit veg.",
        ranges: {
            tempC: range,
            humidityPct: {min: 55, max: 70},
            vpd: {min: 0.8, max: 1.2},
            co2: {min: 700, max: 1200},
            ppfd: {min: 300, max: 600},
        },
        verdicts: {
            tempC: verdict,
            humidityPct: verdict,
            vpd: verdict,
            co2: verdict,
            ppfd: verdict,
        },
        plantObservation: "Leaves look vigorous.",
        recommendations: ["Keep night humidity above 55%."],
        confidence: 70,
    };
}

function stage(): StageContext {
    return {
        stageLabel: "Veg",
        phase: "veg",
        daysSinceSeeding: 21,
        flowerWeek: null,
        lightSchedule: "18/6",
        plant: "Cannabis",
        strain: "Test",
    };
}

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-ai-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = path.join(root, "data");
    await mkdir(process.env.GROWCAST_DATA_DIR, {recursive: true});
    _resetAiSummaryLockForTests();
    _resetGrowWriteLockForTests();
    _resetEnergyAccrueLockForTests();
    try {
        return await fn(root);
    } finally {
        _resetAiSummaryLockForTests();
        _resetGrowWriteLockForTests();
        _resetEnergyAccrueLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(root, {recursive: true, force: true});
    }
}

describe("ai summary stage and stats", () => {
    it("maps German and English stage text", () => {
        assert.equal(deriveGrowPhase("Veg"), "veg");
        assert.equal(deriveGrowPhase("Blüte W3"), "flower");
        assert.equal(deriveGrowPhase("Blüte Woche 7"), "late_flower");
        assert.equal(deriveGrowPhase("Seed"), "seed");
        assert.equal(deriveGrowPhase("Sämling"), "seedling");
        assert.equal(deriveGrowPhase("Ernte"), "harvest");
        const context = stageContextFromGrow({
            plant: "Basil",
            details: {
                strain: "Genovese",
                stage: "Blüte W2",
                seededAt: "2026-09-01",
                lightSchedule: "12/12",
                updatedAt: "",
                notes: "",
            },
        });
        assert.equal(context.phase, "flower");
        assert.equal(context.flowerWeek, 2);
        assert.equal(context.daysSinceSeeding !== null, true);
        const placeholder = stageContextFromGrow({
            plant: "",
            details: {
                strain: "",
                stage: "Veg",
                seededAt: "2001-01-01",
                lightSchedule: "",
                updatedAt: "",
                notes: "",
            },
        });
        assert.equal(placeholder.daysSinceSeeding, null);
    });

    it("splits day/night via isDay and computes percentiles", () => {
        assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
        const points: ClimatePoint[] = [
            {
                t: "2026-10-13T10:00:00.000Z",
                tempC: 24,
                humidityPct: 60,
                vpd: 1.1,
                co2: 800,
                ppfd: 400,
                isDay: true,
            },
            {
                t: "2026-10-13T22:00:00.000Z",
                tempC: 20,
                humidityPct: 70,
                vpd: 0.8,
                co2: 900,
                ppfd: 0,
                isDay: false,
                alarm: true,
            },
        ];
        const stats = aggregateClimateWindow(
            points,
            Date.parse("2026-10-13T08:00:00.000Z"),
            Date.parse("2026-10-14T08:00:00.000Z"),
        );
        assert.equal(stats.dayPointCount, 1);
        assert.equal(stats.nightPointCount, 1);
        assert.equal(stats.alarmCount, 1);
        assert.equal(stats.metrics.tempC.day.avg, 24);
        assert.equal(stats.metrics.tempC.night.avg, 20);
        assert.ok((stats.lightHours ?? 0) > 0);
        const trend = summarizeValues([10, 10, 20, 20], [1, 2, 3, 4]);
        assert.equal(trend.trend, 10);
    });

    it("colors mosaic cells from AI-derived ranges", () => {
        assert.equal(cellForValue(24, 20, 28), 1);
        assert.equal(cellForValue(29, 20, 28), 2);
        assert.equal(cellForValue(40, 20, 28), 3);
        assert.equal(cellForValue(null, 20, 28), 0);
        const mosaic = buildMosaic(
            [
                {
                    t: "2026-10-13T08:00:00.000Z",
                    tempC: 24,
                    humidityPct: 60,
                    vpd: 1,
                    co2: 800,
                    ppfd: 400,
                    isDay: true,
                },
            ],
            Date.parse("2026-10-13T08:00:00.000Z"),
            validAi().ranges,
        );
        assert.equal(mosaic.tempC[0], "1");
    });
});

describe("ai summary schema and prompt", () => {
    it("validates structured output and rejects broken payloads", () => {
        const parsed = parseAiSummaryPayload(validAi());
        assert.ok(parsed);
        assert.equal(parsed?.score, 82);
        assert.equal(parseAiSummaryPayload({...validAi(), score: 200})?.score, 100);
        assert.equal(parseAiSummaryPayload({...validAi(), headline: ""}), null);
        assert.equal(parseAiSummaryPayload(extractJsonObject("noise {\"score\":1} trailing")), null);
        const extracted = extractJsonObject(`prefix ${JSON.stringify(validAi())} suffix`);
        assert.ok(parseAiSummaryPayload(extracted));
    });

    it("sends stage and stats only — never user climate targets", () => {
        const prompt = buildAiSummaryUserPrompt({
            stage: stage(),
            stats: emptyStats(),
            imageUsed: true,
        });
        assert.match(prompt, /Derived phase: veg/);
        assert.equal(promptContainsForbiddenTargets(prompt), false);
        assert.doesNotMatch(prompt, /temperatureDay|humidityNight/);
    });
});

describe("ai summary scheduler and public payload", () => {
    it("is due at 08:00 Berlin and idempotent after success", () => {
        const idle: SchedulerState = {
            lastSuccessDate: null,
            lastAttemptDate: null,
            lastAttemptAt: null,
            lastStatus: "skipped_not_due",
            attemptsOnDate: 0,
        };
        const before = Date.parse("2026-10-14T05:59:00.000Z");
        const after = Date.parse("2026-10-14T06:01:00.000Z");
        assert.equal(isAiSummaryDue(before, idle), false);
        assert.equal(isAiSummaryDue(after, idle), true);
        assert.equal(isAiSummaryDue(after, {...idle, lastSuccessDate: "2026-10-14"}), false);
        assert.equal(
            isAiSummaryDue(after, {
                ...idle,
                lastAttemptDate: "2026-10-14",
                lastStatus: "skipped_daily_cap",
                attemptsOnDate: 1,
            }),
            false,
        );
        assert.equal(
            isAiSummaryDue(after, {
                ...idle,
                lastAttemptDate: "2026-10-14",
                lastAttemptAt: "2026-10-14T12:00:00.000Z",
                lastStatus: "failed",
                attemptsOnDate: 1,
            }),
            false,
        );
        assert.equal(
            isAiSummaryDue(Date.parse("2026-10-14T06:20:00.000Z"), {
                ...idle,
                lastAttemptDate: "2026-10-14",
                lastAttemptAt: "2026-10-14T06:01:00.000Z",
                lastStatus: "failed",
                attemptsOnDate: 1,
            }),
            true,
        );
        assert.equal(
            isAiSummaryDue(after, {
                ...idle,
                lastAttemptDate: "2026-10-14",
                lastStatus: "failed",
                attemptsOnDate: 2,
            }),
            false,
        );
    });

    it("builds a full-day mock mosaic", () => {
        const mosaic = buildMockMosaic();
        assert.equal(mosaic.tempC.length, AI_SUMMARY_MOSAIC_SLOTS);
        assert.match(mosaic.ppfd, /0/);
        assert.match(mosaic.co2, /3/);
        assert.match(mosaic.tempC, /1/);
    });

    it("rate-limits regenerate to one call per window", () => {
        _resetAiSummaryRateLimitForTests();
        const now = 1_000_000;
        assert.equal(allowAiSummaryRegenerate("admin", now).ok, true);
        assert.equal(allowAiSummaryRegenerate("admin", now + 1000).ok, false);
        assert.equal(allowAiSummaryRegenerate("admin", now + 10 * 60 * 1000).ok, true);
        _resetAiSummaryRateLimitForTests();
    });

    it("strips grow id, raw prompts, and image data from the public DTO", async () => {
        await withTempDataDir(async () => {
            const record: AiSummaryRecord = {
                date: "2026-10-14",
                generatedAt: "2026-10-14T06:00:00.000Z",
                growId: "grow-secret",
                stage: stage(),
                stats: emptyStats(),
                ai: validAi(),
                mosaic: {
                    tempC: "1".repeat(288),
                    humidityPct: "0".repeat(288),
                    vpd: "0".repeat(288),
                    co2: "0".repeat(288),
                    ppfd: "0".repeat(288),
                },
                imageUsed: true,
            };
            await writeAiSummaryRecord(record);
            const pub = await toPublicAiSummary(record);
            const text = JSON.stringify(pub);
            assert.equal(text.includes("grow-secret"), false);
            assert.equal(text.includes("data:image"), false);
            assert.equal(text.includes("temperatureDay"), false);
            assert.equal(pub.score, 82);
            assert.equal(pub.scoreHistory[0]?.score, 82);
            assert.ok(parseAiSummaryRecord(record));
        });
    });
});

describe("ai summary generate and archive", () => {
    it("reuses today's file and calls xAI only when forced", async () => {
        await withTempDataDir(async () => {
            const previousKey = process.env.XAI_API_KEY;
            process.env.XAI_API_KEY = "test-key";
            const record: AiSummaryRecord = {
                date: "2026-10-14",
                generatedAt: "2026-10-14T06:00:00.000Z",
                growId: "grow-001",
                stage: stage(),
                stats: emptyStats(),
                ai: validAi(),
                mosaic: {
                    tempC: "0".repeat(288),
                    humidityPct: "0".repeat(288),
                    vpd: "0".repeat(288),
                    co2: "0".repeat(288),
                    ppfd: "0".repeat(288),
                },
                imageUsed: false,
            };
            await writeAiSummaryRecord(record);
            let calls = 0;
            const fetchImpl: typeof fetch = async () => {
                calls += 1;
                return new Response("{}", {status: 500});
            };
            const reused = await generateDailyAiSummary({
                nowMs: Date.parse("2026-10-14T10:00:00.000Z"),
                fetchImpl,
            });
            assert.equal(reused.ok, true);
            if (reused.ok) {
                assert.equal(reused.reused, true);
            }
            assert.equal(calls, 0);

            const forced = await generateDailyAiSummary({
                nowMs: Date.parse("2026-10-14T10:00:00.000Z"),
                force: true,
                fetchImpl: async () => {
                    calls += 1;
                    return Response.json({
                        choices: [{message: {content: JSON.stringify(validAi())}}],
                    });
                },
            });
            assert.equal(forced.ok, true);
            assert.equal(calls, 1);
            if (previousKey === undefined) {
                delete process.env.XAI_API_KEY;
            } else {
                process.env.XAI_API_KEY = previousKey;
            }
        });
    });

    it("reserves a slot before the HTTP call and hard-caps 5 xAI calls per Berlin day", async () => {
        await withTempDataDir(async () => {
            const previousKey = process.env.XAI_API_KEY;
            process.env.XAI_API_KEY = "test-key";
            const nowMs = Date.parse("2026-10-14T10:00:00.000Z");
            let calls = 0;
            const fetchImpl: typeof fetch = async () => {
                calls += 1;
                return Response.json({
                    choices: [{message: {content: JSON.stringify(validAi())}}],
                });
            };
            for (let i = 0; i < AI_SUMMARY_DAILY_API_CAP; i += 1) {
                const result = await generateDailyAiSummary({nowMs, force: true, fetchImpl});
                assert.equal(result.ok, true);
            }
            assert.equal(calls, AI_SUMMARY_DAILY_API_CAP);
            assert.equal((await readAiApiUsage("2026-10-14")).calls, AI_SUMMARY_DAILY_API_CAP);

            const blocked = await generateDailyAiSummary({nowMs, force: true, fetchImpl});
            assert.equal(blocked.ok, false);
            if (!blocked.ok) {
                assert.equal(blocked.reason, "daily_cap");
            }
            assert.equal(calls, AI_SUMMARY_DAILY_API_CAP);

            const reused = await generateDailyAiSummary({nowMs, fetchImpl});
            assert.equal(reused.ok, true);
            if (reused.ok) {
                assert.equal(reused.reused, true);
            }
            assert.equal(calls, AI_SUMMARY_DAILY_API_CAP);

            if (previousKey === undefined) {
                delete process.env.XAI_API_KEY;
            } else {
                process.env.XAI_API_KEY = previousKey;
            }
        });
    });

    it("keeps per-day usage across a clock rollback to a previous Berlin date", async () => {
        await withTempDataDir(async () => {
            for (let i = 0; i < AI_SUMMARY_DAILY_API_CAP; i += 1) {
                assert.equal((await reserveAiApiCall("2026-10-14")).ok, true);
            }
            assert.equal((await reserveAiApiCall("2026-10-14")).ok, false);
            assert.equal((await reserveAiApiCall("2026-10-13")).ok, true);
            assert.equal((await readAiApiUsage("2026-10-14")).calls, AI_SUMMARY_DAILY_API_CAP);
            assert.equal((await readAiApiUsage("2026-10-13")).calls, 1);
        });
    });

    it("elects one scheduler leader and refuses a live peer", async () => {
        await withTempDataDir(async () => {
            const now = Date.parse("2026-10-14T08:00:00.000Z");
            assert.equal(await tryHoldLeaderLease(now, "owner-a"), true);
            assert.equal(await tryHoldLeaderLease(now + 1_000, "owner-b"), false);
            assert.equal(await tryHoldLeaderLease(now + 1_000, "owner-a"), true);
            assert.equal(await tryHoldLeaderLease(now + 200_000, "owner-b"), true);
        });
    });

    it("sends max_tokens on the xAI body", async () => {
        let body: {max_tokens?: number} = {};
        const parsed = await requestGrowSummary({
            userText: "stage only",
            still: null,
            env: {XAI_API_KEY: "test-key", XAI_MODEL: "grok-4.3"} as unknown as NodeJS.ProcessEnv,
            fetchImpl: async (_url, init) => {
                body = JSON.parse(String(init?.body)) as {max_tokens?: number};
                return Response.json({
                    choices: [{message: {content: JSON.stringify(validAi())}}],
                });
            },
        });
        assert.ok(parsed);
        assert.equal(body.max_tokens, XAI_MAX_OUTPUT_TOKENS);
    });

    it("copies climate and summaries into the grow archive and resets current/", async () => {
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
                name: "AI Run",
                plant: "Basil",
                streamUrl: "",
            });
            await writeClimateDay({
                date: "2026-10-13",
                points: [
                    {
                        t: "2026-10-13T12:00:00.000Z",
                        tempC: 24,
                        humidityPct: 60,
                        vpd: 1.1,
                        co2: 800,
                        ppfd: 400,
                        isDay: true,
                    },
                ],
            });
            await writeAiSummaryRecord({
                date: "2026-10-14",
                generatedAt: "2026-10-14T06:00:00.000Z",
                growId: live.id,
                stage: stage(),
                stats: emptyStats(),
                ai: validAi(),
                mosaic: {
                    tempC: "1".repeat(288),
                    humidityPct: "0".repeat(288),
                    vpd: "0".repeat(288),
                    co2: "0".repeat(288),
                    ppfd: "0".repeat(288),
                },
                imageUsed: false,
            });
            const result = await completeCurrentGrow(
                {
                    harvestedAt: "2026-10-14",
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
            const climate = JSON.parse(
                await readFile(
                    path.join(process.env.GROWCAST_DATA_DIR!, "archives", result.archive.archiveId, "climate.json"),
                    "utf8",
                ),
            ) as {days: Record<string, {points: ClimatePoint[]}>};
            assert.equal(climate.days["2026-10-13"]?.points[0]?.tempC, 24);
            const summaries = JSON.parse(
                await readFile(
                    path.join(process.env.GROWCAST_DATA_DIR!, "archives", result.archive.archiveId, "ai-summary.json"),
                    "utf8",
                ),
            ) as {days: Record<string, {ai: {score: number}}>};
            assert.equal(summaries.days["2026-10-14"]?.ai.score, 82);
        });
    });
});
