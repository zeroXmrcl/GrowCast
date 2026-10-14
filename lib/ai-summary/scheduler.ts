import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {berlinDateOnly, berlinHour} from "@/lib/energy/berlin";
import {asNumber, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {hasXaiApiKey} from "@/lib/ai-summary/config";
import {generateDailyAiSummary} from "@/lib/ai-summary/generate";
import {logAiSummary} from "@/lib/ai-summary/log";
import {aiSummaryLeaderFile} from "@/lib/ai-summary/paths";
import {readSchedulerState, writeSchedulerState} from "@/lib/ai-summary/store";
import {AI_SUMMARY_JOB_HOUR, type SchedulerState} from "@/lib/ai-summary/types";

const TICK_MS = 60_000;
const RETRY_GAP_MS = 15 * 60_000;
const MAX_ATTEMPTS = 2;
export const AI_SUMMARY_LEADER_STALE_MS = 150_000;

type SchedulerRuntime = {
    timer: ReturnType<typeof setInterval> | null;
    ticking: boolean;
    ownerId: string;
};

type LeaderLease = {
    ownerId: string;
    pid: number;
    heartbeatAt: string;
};

function schedulerRuntime(): SchedulerRuntime {
    const g = globalThis as typeof globalThis & {__growcastAiSummaryScheduler?: SchedulerRuntime};
    if (!g.__growcastAiSummaryScheduler) {
        g.__growcastAiSummaryScheduler = {
            timer: null,
            ticking: false,
            ownerId: `${process.pid}-${randomBytes(4).toString("hex")}`,
        };
    }
    return g.__growcastAiSummaryScheduler;
}

export function berlinMinutesSinceMidnight(ms: number): number {
    const hourFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Berlin",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
    });
    const parts = hourFormatter.formatToParts(new Date(ms));
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return (Number.isFinite(hour) ? hour : berlinHour(ms)) * 60 + (Number.isFinite(minute) ? minute : 0);
}

export function isAiSummaryDue(nowMs: number, state: SchedulerState): boolean {
    const date = berlinDateOnly(nowMs);
    if (state.lastSuccessDate === date) {
        return false;
    }
    if (berlinMinutesSinceMidnight(nowMs) < AI_SUMMARY_JOB_HOUR * 60) {
        return false;
    }
    if (state.lastAttemptDate === date) {
        if (
            state.lastStatus === "skipped_exists" ||
            state.lastStatus === "skipped_no_key" ||
            state.lastStatus === "skipped_daily_cap"
        ) {
            return false;
        }
        if (state.lastStatus === "failed") {
            if (state.attemptsOnDate >= MAX_ATTEMPTS) {
                return false;
            }
            const lastAt = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
            if (!Number.isFinite(lastAt) || nowMs - lastAt < RETRY_GAP_MS) {
                return false;
            }
        }
    }
    return true;
}

function parseLeaderLease(raw: unknown): LeaderLease | null {
    if (!isRecord(raw)) {
        return null;
    }
    const ownerId = asString(raw.ownerId, "");
    const heartbeatAt = asString(raw.heartbeatAt, "");
    if (!ownerId || !Number.isFinite(Date.parse(heartbeatAt))) {
        return null;
    }
    return {
        ownerId,
        pid: Math.max(0, Math.round(asNumber(raw.pid, 0))),
        heartbeatAt,
    };
}

export async function tryHoldLeaderLease(nowMs: number, ownerId: string): Promise<boolean> {
    let existing: LeaderLease | null = null;
    try {
        existing = parseLeaderLease(JSON.parse(await readFile(aiSummaryLeaderFile(), "utf8")));
    } catch {
        existing = null;
    }
    const lastBeat = existing ? Date.parse(existing.heartbeatAt) : 0;
    const stale = !existing || !Number.isFinite(lastBeat) || nowMs - lastBeat >= AI_SUMMARY_LEADER_STALE_MS;
    if (existing && existing.ownerId !== ownerId && !stale) {
        return false;
    }
    await atomicWriteFile(
        aiSummaryLeaderFile(),
        JSON.stringify(
            {
                ownerId,
                pid: process.pid,
                heartbeatAt: new Date(nowMs).toISOString(),
            },
            null,
            2,
        ),
    );
    return true;
}

export async function runAiSummaryTick(nowMs: number = Date.now()): Promise<SchedulerState> {
    const current = await readSchedulerState();
    const date = berlinDateOnly(nowMs);
    const runtime = schedulerRuntime();
    const leader = await tryHoldLeaderLease(nowMs, runtime.ownerId);
    if (!leader) {
        return current;
    }
    if (!isAiSummaryDue(nowMs, current)) {
        return current;
    }
    if (!hasXaiApiKey()) {
        const skipped: SchedulerState = {
            lastSuccessDate: current.lastSuccessDate,
            lastAttemptDate: date,
            lastAttemptAt: new Date(nowMs).toISOString(),
            lastStatus: "skipped_no_key",
            attemptsOnDate: 1,
        };
        await writeSchedulerState(skipped);
        logAiSummary("skipped_no_key", {date}, "info");
        return skipped;
    }

    const result = await generateDailyAiSummary({nowMs});
    const attemptsOnDate = current.lastAttemptDate === date ? current.attemptsOnDate + 1 : 1;
    if (result.ok) {
        const next: SchedulerState = {
            lastSuccessDate: date,
            lastAttemptDate: date,
            lastAttemptAt: new Date(nowMs).toISOString(),
            lastStatus: result.reused ? "skipped_exists" : "success",
            attemptsOnDate,
        };
        await writeSchedulerState(next);
        return next;
    }
    const next: SchedulerState = {
        lastSuccessDate: current.lastSuccessDate,
        lastAttemptDate: date,
        lastAttemptAt: new Date(nowMs).toISOString(),
        lastStatus:
            result.reason === "no_key"
                ? "skipped_no_key"
                : result.reason === "daily_cap"
                  ? "skipped_daily_cap"
                  : "failed",
        attemptsOnDate,
    };
    await writeSchedulerState(next);
    logAiSummary("tick_failed", {date, reason: result.reason});
    return next;
}

async function safeTick(): Promise<void> {
    const runtime = schedulerRuntime();
    if (runtime.ticking) {
        return;
    }
    runtime.ticking = true;
    try {
        await runAiSummaryTick();
    } catch (error) {
        logAiSummary("tick_error");
        void error;
    } finally {
        runtime.ticking = false;
    }
}

export function startAiSummaryScheduler(): void {
    const runtime = schedulerRuntime();
    if (runtime.timer) {
        return;
    }
    void safeTick();
    runtime.timer = setInterval(() => {
        void safeTick();
    }, TICK_MS);
    runtime.timer.unref?.();
}

export function _resetAiSummarySchedulerForTests(): void {
    const runtime = schedulerRuntime();
    if (runtime.timer) {
        clearInterval(runtime.timer);
        runtime.timer = null;
    }
    runtime.ticking = false;
}
