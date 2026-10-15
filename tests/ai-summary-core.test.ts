import assert from "node:assert/strict";
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {deriveGrowPhase, growAgeDays, stageContextFromGrow} from "../lib/ai-summary/stage.ts";
import {aggregateClimateWindow, percentile, summarizeValues} from "../lib/ai-summary/stats.ts";
import {buildMosaic, cellForValue, foldMosaicRow, mosaicDetail, parseMosaicRow, verdictsFromMosaic} from "../lib/ai-summary/mosaic.ts";
import {applyUnmeasuredRanges, extractJsonObject, parseAiSummaryPayload, parseModelSummary} from "../lib/ai-summary/schema.ts";
import {AI_SUMMARY_SYSTEM_PROMPT, buildAiSummaryUserPrompt, promptContainsForbiddenTargets} from "../lib/ai-summary/prompt.ts";
import {isAiSummaryDue, tryHoldLeaderLease} from "../lib/ai-summary/scheduler.ts";
import {aiSummaryDemoMode, aiSummaryWidgetEnabled} from "../lib/ai-summary/config.ts";
import {AI_SUMMARY_PUBLIC_KEYS, assertPublicSafe, readAiSummaryPublic, toPublicAiSummary} from "../lib/ai-summary/public.ts";
import {parseAiSummaryRecord, readLatestAiSummary, writeAiSummaryRecord, _resetAiSummaryLockForTests} from "../lib/ai-summary/store.ts";
import {allowAiSummaryRegenerate, _resetAiSummaryRateLimitForTests} from "../lib/ai-summary/rate-limit.ts";
import {generateDailyAiSummary} from "../lib/ai-summary/generate.ts";
import {requestGrowSummary, XAI_MAX_OUTPUT_TOKENS} from "../lib/ai-summary/client.ts";
import {reserveAiApiCall, readAiApiUsage} from "../lib/ai-summary/usage.ts";
import {aiSummaryCurrentDir, aiSummaryUsageFile} from "../lib/ai-summary/paths.ts";
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
        assert.equal(growAgeDays("2001-01-01"), null);
        assert.equal(typeof growAgeDays("2026-10-01"), "number");
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
        assert.equal(cellForValue(29, 20, 28), 5);
        assert.equal(cellForValue(19, 20, 28), 4);
        assert.equal(cellForValue(40, 20, 28), 7);
        assert.equal(cellForValue(10, 20, 28), 6);
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
        const withNight = buildMosaic(
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
                {
                    t: "2026-10-13T20:00:00.000Z",
                    tempC: 18,
                    humidityPct: 60,
                    vpd: 1,
                    co2: 800,
                    ppfd: 0,
                    isDay: false,
                },
            ],
            Date.parse("2026-10-13T08:00:00.000Z"),
            validAi().ranges,
        );
        const nightIndex = (12 * 60) / 5;
        assert.equal(withNight.ppfd[nightIndex], "0");
        assert.equal(withNight.tempC[nightIndex], "4");
        const judged = verdictsFromMosaic(withNight, validAi().verdicts);
        assert.equal(judged.ppfd.pctInRange, 100);
        assert.equal(judged.ppfd.verdict, "in_range");
        assert.equal(judged.ppfd.note, "on target");
        assert.equal(judged.tempC.pctInRange, 50);
        assert.equal(judged.tempC.verdict, "off");
    });

    it("folds a half hour to the worst sample and keeps a side over a legacy digit", () => {
        const first = parseMosaicRow(`${"145670"}23${"0".repeat(280)}`);
        assert.equal(first[3], 6);
        assert.equal(first[6], 2);
        assert.deepEqual(foldMosaicRow(first).slice(0, 2), [7, 3]);
        assert.equal(foldMosaicRow(parseMosaicRow(`73${"0".repeat(286)}`))[0], 7);
        assert.equal(foldMosaicRow(parseMosaicRow(`37${"0".repeat(286)}`))[0], 7);
        assert.equal(foldMosaicRow(parseMosaicRow(`45${"0".repeat(286)}`))[0], 5);
        assert.equal(foldMosaicRow(parseMosaicRow("0".repeat(288)))[0], 0);
        assert.equal(mosaicDetail(5)?.word, "ABOVE");
        assert.equal(mosaicDetail(4)?.word, "BELOW");
        assert.equal(mosaicDetail(2), null);
        assert.equal(mosaicDetail(3), null);
        assert.equal(foldMosaicRow(parseMosaicRow("1".repeat(288))).length, 48);
    });
});

describe("ai summary schema and prompt", () => {
    it("validates structured output and rejects broken payloads", () => {
        const parsed = parseAiSummaryPayload(validAi());
        assert.ok(parsed);
        assert.equal(parsed?.score, 82);
        assert.equal(parseAiSummaryPayload({...validAi(), score: 200})?.score, 100);
        assert.equal(parseAiSummaryPayload({...validAi(), headline: ""}), null);
        assert.equal(
            parseAiSummaryPayload({...validAi(), ranges: {...validAi().ranges, tempC: {min: 0, max: 80}}}),
            null,
        );
        const unmeasuredCo2 = emptyStats();
        unmeasuredCo2.metrics = {
            tempC: {...unmeasuredCo2.metrics.tempC, all: {...unmeasuredCo2.metrics.tempC.all, count: 4}},
            humidityPct: {...unmeasuredCo2.metrics.humidityPct, all: {...unmeasuredCo2.metrics.humidityPct.all, count: 4}},
            vpd: {...unmeasuredCo2.metrics.vpd, all: {...unmeasuredCo2.metrics.vpd.all, count: 4}},
            co2: unmeasuredCo2.metrics.co2,
            ppfd: {...unmeasuredCo2.metrics.ppfd, all: {...unmeasuredCo2.metrics.ppfd.all, count: 4}},
        };
        const illegalCo2 = parseModelSummary({
            ...validAi(),
            ranges: {...validAi().ranges, co2: {min: 0, max: 80}},
        });
        assert.ok(illegalCo2);
        const kept = illegalCo2 ? applyUnmeasuredRanges(illegalCo2.ai, illegalCo2.illegal, unmeasuredCo2) : null;
        assert.equal(kept?.ranges.co2, null);
        assert.equal(kept?.ranges.tempC?.min, 20);
        assert.equal(kept?.headline, "Stable veg climate");
        const measured = emptyStats();
        measured.metrics = {
            ...measured.metrics,
            tempC: {...measured.metrics.tempC, all: {...measured.metrics.tempC.all, count: 4}},
        };
        const illegalTemp = parseModelSummary({
            ...validAi(),
            ranges: {...validAi().ranges, tempC: {min: 0, max: 80}},
        });
        assert.ok(illegalTemp);
        assert.equal(
            illegalTemp ? applyUnmeasuredRanges(illegalTemp.ai, illegalTemp.illegal, measured) : null,
            null,
        );
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
        assert.match(prompt, /one band for both/);
        assert.equal(promptContainsForbiddenTargets(prompt), false);
        assert.doesNotMatch(prompt, /temperatureDay|humidityNight/);
        assert.doesNotMatch(AI_SUMMARY_SYSTEM_PROMPT, /day\/night/);
        assert.match(AI_SUMMARY_SYSTEM_PROMPT, /one min and max/);
        assert.match(AI_SUMMARY_SYSTEM_PROMPT, /Lights-off samples are ignored/);
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
            isAiSummaryDue(after, {
                ...idle,
                lastAttemptDate: "2026-10-14",
                lastAttemptAt: "2026-10-14T06:01:00.000Z",
                lastStatus: "rejected",
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
        assert.match(mosaic.co2, /7/);
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

    it("public payload contains only the allowed fields", async () => {
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
            const pub = await toPublicAiSummary(record);
            assert.deepEqual(Object.keys(pub).sort(), [...AI_SUMMARY_PUBLIC_KEYS].sort());
            assertPublicSafe(pub);
            assert.equal("growId" in pub, false);
            assert.equal("stats" in pub, false);
            assert.equal("imageUsed" in pub, false);
            assert.equal("stage" in pub, false);
            assert.throws(() => {
                assertPublicSafe({...pub, growId: "grow-secret"} as unknown as typeof pub);
            });
            assert.throws(() => {
                assertPublicSafe({...pub, stats: emptyStats()} as unknown as typeof pub);
            });
        });
    });

    it("treats 1 and true as demo mode and enables the widget from a key or demo", () => {
        assert.equal(aiSummaryDemoMode({AI_SUMMARY_DEMO: "1"} as NodeJS.ProcessEnv), true);
        assert.equal(aiSummaryDemoMode({AI_SUMMARY_DEMO: "true"} as NodeJS.ProcessEnv), true);
        assert.equal(aiSummaryDemoMode({AI_SUMMARY_DEMO: "TRUE"} as NodeJS.ProcessEnv), true);
        assert.equal(aiSummaryDemoMode({} as NodeJS.ProcessEnv), false);
        assert.equal(aiSummaryDemoMode({AI_SUMMARY_DEMO: ""} as NodeJS.ProcessEnv), false);
        assert.equal(aiSummaryDemoMode({AI_SUMMARY_DEMO: "0"} as NodeJS.ProcessEnv), false);
        assert.equal(aiSummaryWidgetEnabled({} as NodeJS.ProcessEnv), false);
        assert.equal(aiSummaryWidgetEnabled({XAI_API_KEY: "k"} as NodeJS.ProcessEnv), true);
        assert.equal(aiSummaryWidgetEnabled({AI_SUMMARY_DEMO: "1"} as NodeJS.ProcessEnv), true);
        assert.equal(
            aiSummaryWidgetEnabled({XAI_API_KEY: "", AI_SUMMARY_DEMO: "0"} as NodeJS.ProcessEnv),
            false,
        );
    });

    it("serves an in-memory mock when demo mode is on and nothing is stored", async () => {
        await withTempDataDir(async () => {
            const off = await readAiSummaryPublic({} as NodeJS.ProcessEnv);
            assert.equal(off.summary, null);
            assert.equal(off.demo, false);

            const on = await readAiSummaryPublic({AI_SUMMARY_DEMO: "1"} as NodeJS.ProcessEnv);
            assert.equal(on.demo, true);
            assert.ok(on.summary);
            assert.equal(on.summary.score, 78);
            assert.equal(on.summary.headline, "Veg climate mostly in range, night CO₂ a bit high");
            assert.equal(typeof on.summary.mosaic.tempC, "string");
            assert.ok(on.summary.mosaic.tempC.length > 0);
            assert.ok(on.summary.scoreHistory.length > 0);
            const text = JSON.stringify(on.summary);
            assert.equal(text.includes("growId"), false);
            assert.equal(text.includes("grow-mock"), false);
            assertPublicSafe(on.summary);
            assert.equal(await readLatestAiSummary(), null);
        });
    });

    it("keeps a stored summary when demo mode is also on", async () => {
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
            const read = await readAiSummaryPublic({AI_SUMMARY_DEMO: "1"} as NodeJS.ProcessEnv);
            assert.equal(read.demo, false);
            assert.equal(read.summary?.score, 82);
            assert.equal(JSON.stringify(read.summary).includes("grow-secret"), false);
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

    it("keeps the reserved slot after a 500 or invalid response", async () => {
        await withTempDataDir(async () => {
            const previousKey = process.env.XAI_API_KEY;
            process.env.XAI_API_KEY = "test-key";
            const nowMs = Date.parse("2026-10-14T10:00:00.000Z");
            const failed = await generateDailyAiSummary({
                nowMs,
                fetchImpl: async () => new Response("{}", {status: 500}),
            });
            assert.equal(failed.ok, false);
            if (!failed.ok) {
                assert.equal(failed.reason, "request_failed");
            }
            assert.equal((await readAiApiUsage("2026-10-14")).calls, 1);

            await writeClimateDay({
                date: "2026-10-14",
                points: [
                    {
                        t: "2026-10-14T08:00:00.000Z",
                        tempC: 24,
                        humidityPct: 60,
                        vpd: 1,
                        co2: null,
                        ppfd: null,
                        isDay: true,
                    },
                ],
            });
            const rejected = await generateDailyAiSummary({
                nowMs,
                fetchImpl: async () => Response.json({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                ...validAi(),
                                ranges: {...validAi().ranges, tempC: {min: 0, max: 80}},
                            }),
                        },
                    }],
                }),
            });
            assert.equal(rejected.ok, false);
            if (!rejected.ok) {
                assert.equal(rejected.reason, "invalid_response");
            }
            assert.equal((await readAiApiUsage("2026-10-14")).calls, 2);
            if (previousKey === undefined) {
                delete process.env.XAI_API_KEY;
            } else {
                process.env.XAI_API_KEY = previousKey;
            }
        });
    });

    it("blocks a sixth call after five failed 500 or invalid responses in a day", async () => {
        await withTempDataDir(async () => {
            const previousKey = process.env.XAI_API_KEY;
            process.env.XAI_API_KEY = "test-key";
            const nowMs = Date.parse("2026-10-14T10:00:00.000Z");
            let calls = 0;
            const fetchImpl: typeof fetch = async () => {
                calls += 1;
                if (calls % 2 === 0) {
                    return new Response("{}", {status: 500});
                }
                return Response.json({
                    choices: [{message: {content: "not-json"}}],
                });
            };
            for (let i = 0; i < AI_SUMMARY_DAILY_API_CAP; i += 1) {
                const result = await generateDailyAiSummary({nowMs, force: true, fetchImpl});
                assert.equal(result.ok, false);
            }
            assert.equal(calls, AI_SUMMARY_DAILY_API_CAP);
            assert.equal((await readAiApiUsage("2026-10-14")).calls, AI_SUMMARY_DAILY_API_CAP);

            const blocked = await generateDailyAiSummary({nowMs, force: true, fetchImpl});
            assert.equal(blocked.ok, false);
            if (!blocked.ok) {
                assert.equal(blocked.reason, "daily_cap");
            }
            assert.equal(calls, AI_SUMMARY_DAILY_API_CAP);

            if (previousKey === undefined) {
                delete process.env.XAI_API_KEY;
            } else {
                process.env.XAI_API_KEY = previousKey;
            }
        });
    });

    it("refunds the reserved slot only when fetch fails before connect", async () => {
        await withTempDataDir(async () => {
            const previousKey = process.env.XAI_API_KEY;
            process.env.XAI_API_KEY = "test-key";
            const nowMs = Date.parse("2026-10-14T10:00:00.000Z");
            const refused: typeof fetch = async () => {
                const error = new Error("connect ECONNREFUSED 127.0.0.1:443");
                (error as NodeJS.ErrnoException).code = "ECONNREFUSED";
                throw error;
            };
            const failed = await generateDailyAiSummary({nowMs, fetchImpl: refused});
            assert.equal(failed.ok, false);
            if (!failed.ok) {
                assert.equal(failed.reason, "request_failed");
            }
            assert.equal((await readAiApiUsage("2026-10-14")).calls, 0);

            const aborted: typeof fetch = async () => {
                throw new DOMException("The operation was aborted.", "AbortError");
            };
            const timedOut = await generateDailyAiSummary({nowMs, fetchImpl: aborted});
            assert.equal(timedOut.ok, false);
            if (!timedOut.ok) {
                assert.equal(timedOut.reason, "request_failed");
            }
            assert.equal((await readAiApiUsage("2026-10-14")).calls, 1);

            if (previousKey === undefined) {
                delete process.env.XAI_API_KEY;
            } else {
                process.env.XAI_API_KEY = previousKey;
            }
        });
    });

    it("does not call xAI or write files when the key is empty or whitespace", async () => {
        for (const key of ["", "   "]) {
            await withTempDataDir(async () => {
                const previousKey = process.env.XAI_API_KEY;
                process.env.XAI_API_KEY = key;
                const usagePath = aiSummaryUsageFile();
                await mkdir(path.dirname(usagePath), {recursive: true});
                const priorUsage = "{\n  \"date\": \"2026-10-13\",\n  \"calls\": 2,\n  \"days\": {\n    \"2026-10-13\": 2\n  }\n}\n";
                await writeFile(usagePath, priorUsage, "utf8");
                let calls = 0;
                const fetchImpl: typeof fetch = async () => {
                    calls += 1;
                    throw new Error("xAI must not be called");
                };
                try {
                    const result = await generateDailyAiSummary({
                        nowMs: Date.parse("2026-10-14T10:00:00.000Z"),
                        fetchImpl,
                        env: {XAI_API_KEY: key} as unknown as NodeJS.ProcessEnv,
                    });
                    assert.equal(result.ok, false);
                    if (!result.ok) {
                        assert.equal(result.reason, "no_key");
                    }
                    assert.equal(calls, 0);
                    let currentNames: string[] = [];
                    try {
                        currentNames = await readdir(aiSummaryCurrentDir());
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                            throw error;
                        }
                    }
                    assert.deepEqual(currentNames, []);
                    assert.equal(await readFile(usagePath, "utf8"), priorUsage);
                } finally {
                    if (previousKey === undefined) {
                        delete process.env.XAI_API_KEY;
                    } else {
                        process.env.XAI_API_KEY = previousKey;
                    }
                }
            });
        }
    });

    it("refuses fetch when the passed apiKey is empty even if env has a key", async () => {
        let calls = 0;
        const result = await requestGrowSummary({
            userText: "stage only",
            still: null,
            apiKey: "   ",
            env: {XAI_API_KEY: "must-not-be-read"} as unknown as NodeJS.ProcessEnv,
            fetchImpl: async () => {
                calls += 1;
                return new Response("nope", {status: 500});
            },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, "transport");
        }
        assert.equal(calls, 0);
    });

    it("refuses the global fetch in tests when no fetchImpl is given", async () => {
        const env = process.env as {NODE_ENV?: string};
        const previousEnv = env.NODE_ENV;
        env.NODE_ENV = "test";
        try {
            const result = await requestGrowSummary({
                userText: "stage only",
                still: null,
                apiKey: "test-key",
                env: {XAI_API_KEY: "test-key"} as unknown as NodeJS.ProcessEnv,
            });
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.reason, "transport");
            }
        } finally {
            if (previousEnv === undefined) {
                delete env.NODE_ENV;
            } else {
                env.NODE_ENV = previousEnv;
            }
        }
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
            apiKey: "test-key",
            env: {XAI_API_KEY: "test-key", XAI_MODEL: "grok-4.3"} as unknown as NodeJS.ProcessEnv,
            fetchImpl: async (_url, init) => {
                body = JSON.parse(String(init?.body)) as {max_tokens?: number};
                return Response.json({
                    choices: [{message: {content: JSON.stringify(validAi())}}],
                });
            },
        });
        assert.equal(parsed.ok, true);
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
