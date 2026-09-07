"use client";

import {useEffect, useState} from "react";
import {
    OVERLAY_ALERT_DISPLAY_MS,
    alertPlacement,
    alertToastCopy,
    enqueueOverlayAlert,
    type OverlayAlert,
    type OverlayAlertKind,
} from "@/lib/overlay-alert";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {DEFAULT_OVERLAY_SCALE_PCT, overlayAlertScaleStyle, parseOverlayScalePct} from "@/lib/overlay-scale";

const PROGRAM_ALERTS_PATH = "/api/overlay/program-alerts";
const PROGRAM_AUDIO_PATH = "/api/overlay/program-audio";
const PROGRAM_AUDIO_POLL_MS = 2000;

const ALERT_KINDS = new Set<OverlayAlertKind>(["follow", "sub", "raid", "bits", "manual"]);

function isOverlayAlertKind(value: unknown): value is OverlayAlertKind {
    return typeof value === "string" && ALERT_KINDS.has(value as OverlayAlertKind);
}

function parseOverlayAlert(raw: unknown): OverlayAlert | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const value = raw as Record<string, unknown>;
    if (typeof value.id !== "string" || value.id.length === 0) {
        return null;
    }
    if (!isOverlayAlertKind(value.kind)) {
        return null;
    }
    if (typeof value.title !== "string" || typeof value.body !== "string") {
        return null;
    }
    if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) {
        return null;
    }
    return {
        id: value.id,
        kind: value.kind,
        title: value.title,
        body: value.body,
        createdAt: value.createdAt,
    };
}

function parseAlertScalePct(raw: unknown): number | null {
    if (raw === null || typeof raw !== "object" || !("alertScalePct" in raw)) {
        return null;
    }
    return parseOverlayScalePct((raw as {alertScalePct: unknown}).alertScalePct);
}

export default function OverlayAlertLayer({
    layout,
    captureToken,
}: {
    layout: OverlayLayout;
    captureToken?: string;
}) {
    const [queue, setQueue] = useState<OverlayAlert[]>([]);
    const [scalePct, setScalePct] = useState(DEFAULT_OVERLAY_SCALE_PCT);
    const current = queue[0];

    useEffect(() => {
        const url = captureToken
            ? `${PROGRAM_ALERTS_PATH}?token=${encodeURIComponent(captureToken)}`
            : PROGRAM_ALERTS_PATH;
        const source = new EventSource(url);
        source.onmessage = (event) => {
            let raw: unknown;
            try {
                raw = JSON.parse(event.data) as unknown;
            } catch {
                return;
            }
            const alert = parseOverlayAlert(raw);
            if (!alert) {
                return;
            }
            setQueue((currentQueue) => enqueueOverlayAlert(currentQueue, alert));
        };
        return () => {
            source.close();
        };
    }, [captureToken]);

    useEffect(() => {
        const abort = new AbortController();
        let cancelled = false;

        async function poll() {
            try {
                const headers: HeadersInit = {};
                if (captureToken) {
                    headers["x-growcast-capture"] = captureToken;
                }
                const response = await fetch(PROGRAM_AUDIO_PATH, {
                    credentials: "include",
                    cache: "no-store",
                    headers,
                    signal: abort.signal,
                });
                if (!response.ok || cancelled) {
                    return;
                }
                const parsed = parseAlertScalePct(await response.json());
                if (parsed === null || cancelled) {
                    return;
                }
                setScalePct(parsed);
            } catch {
                // keep last good scale; first paint is 100
            }
        }

        void poll();
        const timer = window.setInterval(() => {
            void poll();
        }, PROGRAM_AUDIO_POLL_MS);
        return () => {
            cancelled = true;
            abort.abort();
            window.clearInterval(timer);
        };
    }, [captureToken]);

    useEffect(() => {
        if (!current) {
            return;
        }
        window.dispatchEvent(new CustomEvent("growcast-alert-sting"));
        const timer = window.setTimeout(() => {
            setQueue((currentQueue) =>
                currentQueue[0]?.id === current.id ? currentQueue.slice(1) : currentQueue,
            );
        }, OVERLAY_ALERT_DISPLAY_MS);
        return () => {
            window.clearTimeout(timer);
        };
    }, [current]);

    if (!current) {
        return null;
    }

    const placement = alertPlacement(layout);
    const copy = alertToastCopy(current);
    const positionClass =
        placement === "top-right"
            ? "absolute z-20 top-8 right-8"
            : "absolute z-20 top-8 left-8";

    return (
        <div
            className={`pointer-events-none ${positionClass}`}
            style={overlayAlertScaleStyle(scalePct, layout)}
        >
            <div className="flex min-w-[340px] max-w-[28rem] overflow-hidden rounded-[14px] border border-white/8 bg-[rgba(9,9,11,0.86)] shadow-[0_18px_40px_rgba(0,0,0,0.5)]">
                <div className="w-1.5 shrink-0 bg-[#22c55e]" />
                <div className="px-5 py-3.5 pl-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#4ade80]">
                        {copy.chip}
                    </p>
                    <p className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight text-zinc-50">
                        {copy.headline}
                    </p>
                </div>
            </div>
        </div>
    );
}
