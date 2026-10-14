import {childLogger} from "@/lib/logging/logger";

export function logClimate(
    reason: string,
    extra: Record<string, unknown> = {},
    level: "info" | "warn" = "warn",
): void {
    const log = childLogger();
    if (level === "info") {
        log.info({event: "climate", reason, ...extra});
        return;
    }
    log.warn({event: "climate", reason, ...extra});
}
