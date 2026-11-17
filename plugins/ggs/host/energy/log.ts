import {childLogger} from "@/lib/logging/logger";

export function logEnergy(
    reason: string,
    extra: Record<string, unknown> = {},
    level: "info" | "warn" = "warn",
): void {
    const log = childLogger();
    if (level === "info") {
        log.info({reason, ...extra});
        return;
    }
    log.warn({reason, ...extra});
}
