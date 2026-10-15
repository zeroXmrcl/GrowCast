"use client";

import {useEffect, useState} from "react";
import type {LiveReadingsBundle} from "@/lib/ai-summary/live-metrics";
import {
    AI_SUMMARY_MOSAIC_POLL_MS,
    fetchPublicMosaic,
    mosaicWindowStartMs,
    rollMosaicForDisplay,
} from "@/lib/ai-summary/rolling-mosaic";
import type {AiSummaryPublic} from "@/lib/ai-summary/types";
import type {ClimateMetricKey} from "@/lib/climate/types";

type PolledMosaic = {
    key: string;
    mosaic: Record<ClimateMetricKey, string>;
    windowStartMs: number;
};

export function useRollingAiMosaic(input: {
    summary: AiSummaryPublic | null;
    demo: boolean;
    nowMs: number;
    liveBundle: LiveReadingsBundle;
    liveFresh: boolean;
}): {mosaic: Record<ClimateMetricKey, string>; windowStartMs: number} | null {
    const assessmentKey = input.summary ? `${input.summary.date}:${input.summary.generatedAt}` : "";
    const [heldWindow, setHeldWindow] = useState(() => ({
        key: assessmentKey,
        windowStartMs: mosaicWindowStartMs(input.nowMs),
    }));
    const [poll, setPoll] = useState<PolledMosaic | null>(null);
    const heldWindowStartMs = heldWindow.key === assessmentKey
        ? heldWindow.windowStartMs
        : mosaicWindowStartMs(input.nowMs);

    if (heldWindow.key !== assessmentKey) {
        setHeldWindow({
            key: assessmentKey,
            windowStartMs: heldWindowStartMs,
        });
    }

    useEffect(() => {
        if (!input.summary || input.demo) {
            return;
        }
        const abort = new AbortController();
        const timer = window.setInterval(() => {
            void fetchPublicMosaic(fetch, undefined, abort.signal).then((mosaic) => {
                if (!mosaic) {
                    return;
                }
                setPoll({
                    key: assessmentKey,
                    mosaic,
                    windowStartMs: mosaicWindowStartMs(Date.now()),
                });
            });
        }, AI_SUMMARY_MOSAIC_POLL_MS);
        return () => {
            abort.abort();
            window.clearInterval(timer);
        };
    }, [assessmentKey, input.demo, input.summary]);

    if (!input.summary) {
        return null;
    }

    const polled = poll && poll.key === assessmentKey ? poll : null;
    return rollMosaicForDisplay({
        mosaic: input.demo ? input.summary.mosaic : (polled?.mosaic ?? input.summary.mosaic),
        mosaicWindowStartMs: input.demo
            ? mosaicWindowStartMs(input.nowMs)
            : (polled?.windowStartMs ?? heldWindowStartMs),
        nowMs: input.nowMs,
        ranges: input.summary.ranges,
        liveValues: input.liveBundle.values,
        liveFresh: input.liveFresh,
        isDay: input.liveBundle.isDay,
        slideHistory: !input.demo,
    });
}
