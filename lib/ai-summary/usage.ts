import {mkdir, open, readFile, stat, unlink} from "node:fs/promises";
import path from "node:path";
import {asNumber, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {isDateOnly} from "@/lib/date-only";
import {aiSummaryUsageFile, aiSummaryUsageLockFile} from "@/lib/ai-summary/paths";
import {AI_SUMMARY_DAILY_API_CAP} from "@/lib/ai-summary/types";

const LOCK_STALE_MS = 15_000;
const LOCK_WAIT_MS = 8_000;

export type AiApiUsage = {
    date: string;
    calls: number;
};

type UsageFile = {
    date: string;
    calls: number;
    days: Record<string, number>;
};

class CorruptUsageFile extends Error {
    constructor() {
        super("ai_summary_usage_corrupt");
    }
}

function parseUsageFile(raw: unknown): UsageFile {
    if (!isRecord(raw)) {
        throw new CorruptUsageFile();
    }
    const days: Record<string, number> = {};
    if (raw.days !== undefined && !isRecord(raw.days)) {
        throw new CorruptUsageFile();
    }
    if (isRecord(raw.days)) {
        for (const [key, value] of Object.entries(raw.days)) {
            if (!isDateOnly(key) || typeof value !== "number" || !Number.isFinite(value)) {
                throw new CorruptUsageFile();
            }
            days[key] = Math.max(0, Math.round(value));
        }
    }
    const date = asString(raw.date, "");
    if (raw.date !== undefined && date !== "" && !isDateOnly(date)) {
        throw new CorruptUsageFile();
    }
    if (raw.calls !== undefined && (typeof raw.calls !== "number" || !Number.isFinite(raw.calls))) {
        throw new CorruptUsageFile();
    }
    const calls = Math.max(0, Math.round(asNumber(raw.calls, 0)));
    if (isDateOnly(date) && days[date] === undefined) {
        days[date] = calls;
    }
    return {date, calls, days};
}

async function loadUsageFile(): Promise<UsageFile | "missing"> {
    let text: string;
    try {
        text = await readFile(aiSummaryUsageFile(), "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return "missing";
        }
        throw new CorruptUsageFile();
    }
    try {
        return parseUsageFile(JSON.parse(text));
    } catch (error) {
        if (error instanceof CorruptUsageFile) {
            throw error;
        }
        throw new CorruptUsageFile();
    }
}

export function parseAiApiUsage(raw: unknown, date: string): AiApiUsage {
    const parsed = parseUsageFile(raw);
    return {date, calls: parsed.days[date] ?? 0};
}

export async function readAiApiUsage(date: string): Promise<AiApiUsage> {
    try {
        const loaded = await loadUsageFile();
        if (loaded === "missing") {
            return {date, calls: 0};
        }
        return {date, calls: loaded.days[date] ?? 0};
    } catch (error) {
        if (error instanceof CorruptUsageFile) {
            return {date, calls: AI_SUMMARY_DAILY_API_CAP};
        }
        throw error;
    }
}

async function writeAiApiUsage(date: string, calls: number, previous: UsageFile): Promise<void> {
    const days = {...previous.days, [date]: calls};
    const kept = Object.keys(days)
        .sort()
        .slice(-4);
    const nextDays: Record<string, number> = {};
    for (const key of kept) {
        nextDays[key] = days[key] ?? 0;
    }
    await atomicWriteFile(
        aiSummaryUsageFile(),
        JSON.stringify({date, calls, days: nextDays}, null, 2),
    );
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withUsageLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockPath = aiSummaryUsageLockFile();
    await mkdir(path.dirname(lockPath), {recursive: true});
    const started = Date.now();
    while (Date.now() - started < LOCK_WAIT_MS) {
        try {
            const handle = await open(lockPath, "wx");
            try {
                await handle.writeFile(
                    JSON.stringify({pid: process.pid, at: new Date().toISOString()}),
                );
                return await fn();
            } finally {
                await handle.close().catch(() => undefined);
                await unlink(lockPath).catch(() => undefined);
            }
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST") {
                throw error;
            }
            try {
                const info = await stat(lockPath);
                if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
                    await unlink(lockPath).catch(() => undefined);
                    continue;
                }
            } catch {
                // lock vanished; retry create
            }
            await sleep(25);
        }
    }
    throw new Error("ai_summary_usage_lock_timeout");
}

export async function reserveAiApiCall(
    date: string,
    cap: number = AI_SUMMARY_DAILY_API_CAP,
): Promise<{ok: true; usage: AiApiUsage} | {ok: false; usage: AiApiUsage}> {
    if (!isDateOnly(date)) {
        return {ok: false, usage: {date, calls: cap}};
    }
    return withUsageLock(async () => {
        let previous: UsageFile;
        try {
            const loaded = await loadUsageFile();
            previous = loaded === "missing" ? {date: "", calls: 0, days: {}} : loaded;
        } catch (error) {
            if (error instanceof CorruptUsageFile) {
                return {ok: false, usage: {date, calls: cap}};
            }
            throw error;
        }
        const usage = {date, calls: previous.days[date] ?? 0};
        if (usage.calls >= cap) {
            return {ok: false, usage};
        }
        const next = {date, calls: usage.calls + 1};
        await writeAiApiUsage(date, next.calls, previous);
        return {ok: true, usage: next};
    });
}

export async function releaseAiApiCall(date: string): Promise<void> {
    if (!isDateOnly(date)) {
        return;
    }
    await withUsageLock(async () => {
        let previous: UsageFile;
        try {
            const loaded = await loadUsageFile();
            if (loaded === "missing") {
                return;
            }
            previous = loaded;
        } catch {
            return;
        }
        const calls = previous.days[date] ?? 0;
        if (calls <= 0) {
            return;
        }
        await writeAiApiUsage(date, calls - 1, previous);
    });
}
