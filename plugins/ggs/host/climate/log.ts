import {childLogger} from "@/lib/logging/logger";

type ClimateLogListener = (reason: string, extra: Record<string, unknown>, level: "info" | "warn") => void;

let testListener: ClimateLogListener | undefined;

export function _setClimateLogListenerForTests(listener?: ClimateLogListener): void {
    testListener = listener;
}

export function logClimate(
    reason: string,
    extra: Record<string, unknown> = {},
    level: "info" | "warn" = "warn",
): void {
    testListener?.(reason, extra, level);
    const log = childLogger();
    if (level === "info") {
        log.info({event: "climate", reason, ...extra});
        return;
    }
    log.warn({event: "climate", reason, ...extra});
}
