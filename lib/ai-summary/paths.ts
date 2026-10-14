import path from "node:path";
import {growcastDataDir} from "@/lib/data-paths";

export function aiSummaryDir(): string {
    return path.join(growcastDataDir(), "ai-summary");
}

export function aiSummaryCurrentDir(): string {
    return path.join(aiSummaryDir(), "current");
}

export function aiSummaryDayFile(dateOnly: string): string {
    return path.join(aiSummaryCurrentDir(), `${dateOnly}.json`);
}

export function aiSummaryLatestFile(): string {
    return path.join(aiSummaryDir(), "latest.json");
}

export function aiSummarySchedulerFile(): string {
    return path.join(aiSummaryDir(), "scheduler.json");
}

export function archiveAiSummaryFile(archiveId: string): string {
    return path.join(growcastDataDir(), "archives", archiveId, "ai-summary.json");
}
