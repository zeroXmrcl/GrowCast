import {mkdir, readdir, readFile, rm} from "node:fs/promises";
import {asNumber, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {isDateOnly} from "@/lib/date-only";
import {CLIMATE_METRIC_KEYS, type ClimateMetricKey} from "@/lib/climate/types";
import {parseAiSummaryPayload} from "@/lib/ai-summary/schema";
import {emptyMosaic, parseMosaicRow, encodeMosaicRow} from "@/lib/ai-summary/mosaic";
import {logAiSummary} from "@/lib/ai-summary/log";
import {
    aiSummaryCurrentDir,
    aiSummaryDayFile,
    aiSummaryLatestFile,
    aiSummarySchedulerFile,
} from "@/lib/ai-summary/paths";
import type {
    AiSummaryRecord,
    AiSummaryScorePoint,
    GrowPhase,
    SchedulerState,
    StageContext,
} from "@/lib/ai-summary/types";
import {AI_SUMMARY_SCORE_DAYS} from "@/lib/ai-summary/types";
import type {ClimateWindowStats} from "@/lib/ai-summary/types";

const DAY_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;
const PHASES = new Set<GrowPhase>([
    "seed",
    "seedling",
    "veg",
    "flower",
    "late_flower",
    "harvest",
    "unknown",
]);

function parseStage(raw: unknown): StageContext | null {
    if (!isRecord(raw)) {
        return null;
    }
    const phase = asString(raw.phase, "unknown");
    if (!PHASES.has(phase as GrowPhase)) {
        return null;
    }
    const days = raw.daysSinceSeeding;
    const flowerWeek = raw.flowerWeek;
    return {
        stageLabel: asString(raw.stageLabel, ""),
        phase: phase as GrowPhase,
        daysSinceSeeding:
            typeof days === "number" && Number.isFinite(days) && days >= 0 ? Math.round(days) : null,
        flowerWeek:
            typeof flowerWeek === "number" && Number.isInteger(flowerWeek) && flowerWeek >= 1
                ? flowerWeek
                : null,
        lightSchedule: asString(raw.lightSchedule, ""),
        plant: asString(raw.plant, ""),
        strain: asString(raw.strain, ""),
    };
}

function parseStats(raw: unknown): ClimateWindowStats | null {
    if (!isRecord(raw) || !isRecord(raw.metrics)) {
        return null;
    }
    const windowStart = asString(raw.windowStart, "");
    const windowEnd = asString(raw.windowEnd, "");
    if (!Number.isFinite(Date.parse(windowStart)) || !Number.isFinite(Date.parse(windowEnd))) {
        return null;
    }
    return raw as ClimateWindowStats;
}

function parseMosaic(raw: unknown): Record<ClimateMetricKey, string> {
    const fallback = emptyMosaic();
    if (!isRecord(raw)) {
        return fallback;
    }
    const out = {...fallback};
    for (const key of CLIMATE_METRIC_KEYS) {
        const value = raw[key];
        if (typeof value === "string") {
            out[key] = encodeMosaicRow(parseMosaicRow(value));
        }
    }
    return out;
}

export function parseAiSummaryRecord(raw: unknown): AiSummaryRecord | null {
    if (!isRecord(raw)) {
        return null;
    }
    const date = asString(raw.date, "");
    const generatedAt = asString(raw.generatedAt, "");
    const growId = asString(raw.growId, "");
    if (!isDateOnly(date) || !Number.isFinite(Date.parse(generatedAt)) || !growId) {
        return null;
    }
    const stage = parseStage(raw.stage);
    const stats = parseStats(raw.stats);
    const ai = parseAiSummaryPayload(raw.ai);
    if (!stage || !stats || !ai) {
        return null;
    }
    return {
        date,
        generatedAt,
        growId,
        stage,
        stats,
        ai,
        mosaic: parseMosaic(raw.mosaic),
        imageUsed: raw.imageUsed === true,
    };
}

export async function readAiSummaryDay(dateOnly: string): Promise<AiSummaryRecord | null> {
    try {
        const parsed = parseAiSummaryRecord(JSON.parse(await readFile(aiSummaryDayFile(dateOnly), "utf8")));
        if (!parsed) {
            logAiSummary("corrupt_ai_summary_day", {date: dateOnly});
        }
        return parsed;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        logAiSummary("corrupt_ai_summary_day", {date: dateOnly});
        return null;
    }
}

export async function readLatestAiSummary(): Promise<AiSummaryRecord | null> {
    try {
        const parsed = parseAiSummaryRecord(JSON.parse(await readFile(aiSummaryLatestFile(), "utf8")));
        if (!parsed) {
            logAiSummary("corrupt_ai_summary_latest");
        }
        return parsed;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        logAiSummary("corrupt_ai_summary_latest");
        return null;
    }
}

export async function writeAiSummaryRecord(record: AiSummaryRecord): Promise<void> {
    const body = JSON.stringify(record, null, 2);
    await atomicWriteFile(aiSummaryDayFile(record.date), body);
    await atomicWriteFile(aiSummaryLatestFile(), body);
}

export async function listAiSummaryDates(): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(aiSummaryCurrentDir(), {withFileTypes: true});
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        return [];
    }
    const dates: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        const match = DAY_FILE_NAME.exec(entry.name);
        if (match) {
            dates.push(match[1]);
        }
    }
    return dates.sort();
}

export async function readScoreHistory(endDate: string, days = AI_SUMMARY_SCORE_DAYS): Promise<AiSummaryScorePoint[]> {
    const dates = await listAiSummaryDates();
    const kept = dates.filter((date) => date <= endDate).slice(-days);
    const points: AiSummaryScorePoint[] = [];
    for (const date of kept) {
        const record = await readAiSummaryDay(date);
        if (record) {
            points.push({date: record.date, score: record.ai.score});
        }
    }
    return points;
}

export function parseSchedulerState(raw: unknown): SchedulerState {
    if (!isRecord(raw)) {
        return {
            lastSuccessDate: null,
            lastAttemptDate: null,
            lastAttemptAt: null,
            lastStatus: "skipped_not_due",
            attemptsOnDate: 0,
        };
    }
    const lastStatus = asString(raw.lastStatus, "skipped_not_due");
    const allowed = new Set([
        "success",
        "failed",
        "skipped_no_key",
        "skipped_exists",
        "skipped_not_due",
        "skipped_daily_cap",
        "skipped_not_leader",
        "rejected",
    ]);
    return {
        lastSuccessDate: asString(raw.lastSuccessDate, "") || null,
        lastAttemptDate: asString(raw.lastAttemptDate, "") || null,
        lastAttemptAt: asString(raw.lastAttemptAt, "") || null,
        lastStatus: allowed.has(lastStatus) ? (lastStatus as SchedulerState["lastStatus"]) : "skipped_not_due",
        attemptsOnDate: Math.max(0, Math.round(asNumber(raw.attemptsOnDate, 0))),
    };
}

export async function readSchedulerState(): Promise<SchedulerState> {
    try {
        return parseSchedulerState(JSON.parse(await readFile(aiSummarySchedulerFile(), "utf8")));
    } catch {
        return parseSchedulerState(null);
    }
}

export async function writeSchedulerState(state: SchedulerState): Promise<void> {
    await atomicWriteFile(aiSummarySchedulerFile(), JSON.stringify(state, null, 2));
}

export async function resetAiSummaryCurrent(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            await rm(aiSummaryCurrentDir(), {recursive: true, force: true});
            await mkdir(aiSummaryCurrentDir(), {recursive: true});
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        }
    }
    throw lastError;
}

let writeChain: Promise<unknown> = Promise.resolve();

export function withAiSummaryLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn);
    writeChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

export function _resetAiSummaryLockForTests(): void {
    writeChain = Promise.resolve();
}
