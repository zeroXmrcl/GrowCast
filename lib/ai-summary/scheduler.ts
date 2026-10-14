import {berlinDateOnly, berlinHour} from "@/lib/energy/berlin";
import {hasXaiApiKey} from "@/lib/ai-summary/config";
import {generateDailyAiSummary} from "@/lib/ai-summary/generate";
import {logAiSummary} from "@/lib/ai-summary/log";
import {readSchedulerState, writeSchedulerState} from "@/lib/ai-summary/store";
import {AI_SUMMARY_JOB_HOUR, type SchedulerState} from "@/lib/ai-summary/types";

const TICK_MS = 60_000;
const RETRY_GAP_MS = 15 * 60_000;
const MAX_ATTEMPTS = 2;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

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
        if (state.lastStatus === "skipped_exists" || state.lastStatus === "skipped_no_key") {
            return false;
        }
        if (state.lastStatus === "failed") {
            if (state.attemptsOnDate >= MAX_ATTEMPTS) {
                return false;
            }
            const lastAt = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
            if (Number.isFinite(lastAt) && nowMs - lastAt < RETRY_GAP_MS) {
                return false;
            }
        }
    }
    return true;
}

export async function runAiSummaryTick(nowMs: number = Date.now()): Promise<SchedulerState> {
    const current = await readSchedulerState();
    const date = berlinDateOnly(nowMs);
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
        lastStatus: result.reason === "no_key" ? "skipped_no_key" : "failed",
        attemptsOnDate,
    };
    await writeSchedulerState(next);
    logAiSummary("tick_failed", {date, reason: result.reason});
    return next;
}

async function safeTick(): Promise<void> {
    if (ticking) {
        return;
    }
    ticking = true;
    try {
        await runAiSummaryTick();
    } catch (error) {
        logAiSummary("tick_error");
        void error;
    } finally {
        ticking = false;
    }
}

export function startAiSummaryScheduler(): void {
    if (timer) {
        return;
    }
    void safeTick();
    timer = setInterval(() => {
        void safeTick();
    }, TICK_MS);
    timer.unref?.();
}

export function _resetAiSummarySchedulerForTests(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    ticking = false;
}
