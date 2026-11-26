"use client";

import {useEffect, useState} from "react";
import {emptyReadings, liveReadingsFromPlugin, type LiveReadingsBundle} from "@/lib/ai-summary/live-metrics";
import {PLUGIN_STALE_AFTER_MS} from "@/lib/plugins/types";
import type {PluginLiveReadings} from "@/lib/plugins/types";

const LIVE_READINGS_URL = "/api/data/live-readings";
const POLL_MS = 5_000;

function parseLive(raw: unknown): PluginLiveReadings | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const values = record.values && typeof record.values === "object"
        ? record.values as PluginLiveReadings["values"]
        : null;
    if (!values) {
        return null;
    }
    return {
        values,
        isDay: typeof record.isDay === "boolean" ? record.isDay : null,
        asOf: typeof record.asOf === "string" ? record.asOf : null,
    };
}

export function usePluginLiveReadings(): {
    bundle: LiveReadingsBundle;
    stale: boolean;
    nowMs: number;
} {
    const [live, setLive] = useState<PluginLiveReadings | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        let cancelled = false;
        async function tick() {
            try {
                const response = await fetch(LIVE_READINGS_URL, {cache: "no-store"});
                if (!response.ok) {
                    return;
                }
                const parsed = parseLive(await response.json());
                if (!cancelled) {
                    setLive(parsed);
                    setNowMs(Date.now());
                }
            } catch {
                // next interval retries
            }
        }
        void tick();
        const poll = window.setInterval(tick, POLL_MS);
        const clock = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => {
            cancelled = true;
            window.clearInterval(poll);
            window.clearInterval(clock);
        };
    }, []);

    const asOfMs = live?.asOf ? Date.parse(live.asOf) : Number.NaN;
    const stale = !Number.isFinite(asOfMs) || nowMs - asOfMs > PLUGIN_STALE_AFTER_MS;
    return {
        bundle: liveReadingsFromPlugin(live),
        stale,
        nowMs,
    };
}

export const EMPTY_LIVE_BUNDLE: LiveReadingsBundle = {values: emptyReadings(), isDay: null};
