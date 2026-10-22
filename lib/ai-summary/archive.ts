import path from "node:path";
import {unlink} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import {AI_SUMMARY_ARCHIVE_VERSION, type AiSummaryRecord} from "@/lib/ai-summary/types";
import {logAiSummary} from "@/lib/ai-summary/log";
import {
    listAiSummaryDates,
    parseAiSummaryRecord,
    readAiSummaryDay,
    resetAiSummaryCurrent,
    withAiSummaryLock,
} from "@/lib/ai-summary/store";
import {aiSummaryLatestFile} from "@/lib/ai-summary/paths";

export type AiSummaryArchiveFile = {
    version: typeof AI_SUMMARY_ARCHIVE_VERSION;
    growId: string;
    startedAt: string;
    endedAt: string;
    days: Record<string, AiSummaryRecord>;
};

export class AiSummaryCopyError extends Error {
    constructor() {
        super("ai_summary_copy_failed");
        this.name = "AiSummaryCopyError";
    }
}

export async function buildAiSummaryArchivePayload(
    growId: string,
    endedAt: string,
    startedAt: string,
): Promise<AiSummaryArchiveFile> {
    const dates = await listAiSummaryDates();
    const days: Record<string, AiSummaryRecord> = {};
    for (const date of dates) {
        const record = await readAiSummaryDay(date);
        if (!record) {
            throw new AiSummaryCopyError();
        }
        days[date] = record;
    }
    return {
        version: AI_SUMMARY_ARCHIVE_VERSION,
        growId,
        startedAt,
        endedAt,
        days,
    };
}

export async function stageAiSummaryArchive(
    stagingRoot: string,
    growId: string,
    endedAt: string,
    startedAt: string,
): Promise<void> {
    const dates = await listAiSummaryDates();
    try {
        const payload = await buildAiSummaryArchivePayload(growId, endedAt, startedAt);
        await atomicWriteFile(
            path.join(stagingRoot, "ai-summary.json"),
            JSON.stringify(payload, null, 2),
        );
    } catch (error) {
        if (error instanceof AiSummaryCopyError) {
            throw error;
        }
        if (dates.length > 0) {
            throw new AiSummaryCopyError();
        }
        try {
            await atomicWriteFile(
                path.join(stagingRoot, "ai-summary.json"),
                JSON.stringify(
                    {
                        version: AI_SUMMARY_ARCHIVE_VERSION,
                        growId,
                        startedAt,
                        endedAt,
                        days: {},
                    } satisfies AiSummaryArchiveFile,
                    null,
                    2,
                ),
            );
        } catch {
            // Optional file; grow complete still succeeds when there were no summaries.
        }
    }
}

export async function resetAiSummaryCurrentLocked(): Promise<void> {
    await withAiSummaryLock(async () => {
        await resetAiSummaryCurrent();
        try {
            await unlink(aiSummaryLatestFile());
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                logAiSummary("latest_reset_failed");
            }
        }
    });
}

export {parseAiSummaryRecord};
