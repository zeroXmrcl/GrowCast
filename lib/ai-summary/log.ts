import {childLogger} from "@/lib/logging/logger";

export function logAiSummary(
    reason: string,
    extra: Record<string, unknown> = {},
    level: "info" | "warn" = "warn",
): void {
    const log = childLogger();
    const payload = {event: "ai_summary", reason, ...extra};
    if (level === "info") {
        log.info(payload);
        return;
    }
    log.warn(payload);
}
