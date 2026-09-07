"use client";

import {useEffect, useState} from "react";
import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {
    OVERLAY_ALERT_DISPLAY_MS,
    alertPlacement,
    enqueueOverlayAlert,
    type OverlayAlert,
    type OverlayAlertKind,
} from "@/lib/overlay-alert";
import type {OverlayLayout} from "@/lib/overlay-layout";

const PROGRAM_ALERTS_PATH = "/api/overlay/program-alerts";

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

export default function OverlayAlertLayer({
    layout,
    captureToken,
}: {
    layout: OverlayLayout;
    captureToken?: string;
}) {
    const [queue, setQueue] = useState<OverlayAlert[]>([]);
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
    const positionClass =
        placement === "bottom-right"
            ? "absolute z-20 bottom-8 right-8"
            : "absolute z-20 top-8 left-1/2 -translate-x-1/2";

    return (
        <div className={`pointer-events-none ${positionClass}`}>
            <div className={OVERLAY_PANEL_CLASS}>
                <p className="text-sm font-semibold text-zinc-50">{current.title}</p>
                <p className="mt-0.5 text-sm text-zinc-200">{current.body}</p>
            </div>
        </div>
    );
}
