"use client";

import {useLayoutEffect, useRef, useSyncExternalStore} from "react";
import {
    CLIMATE_TICK_EASING,
    climateTickDurationMs,
    climateTickIndex,
    climateTickLabels,
    type ClimateTickKind,
} from "@/lib/climate-tick";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onStoreChange: () => void): () => void {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    media.addEventListener("change", onStoreChange);
    return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot(): boolean {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
    return false;
}

function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribeReducedMotion,
        getReducedMotionSnapshot,
        getReducedMotionServerSnapshot,
    );
}

export default function ClimatePickerValue({
    kind,
    value,
    size = "overlay",
}: {
    kind: ClimateTickKind;
    value: number | null;
    size?: "overlay" | "dash";
}) {
    const reduced = usePrefersReducedMotion();
    const lastIndex = useRef<number | null>(null);
    const labels = climateTickLabels(kind);
    const dash = size === "dash";
    const idx = value === null ? null : climateTickIndex(kind, value);
    const prev = lastIndex.current;
    const dist = idx === null || prev === null ? 0 : Math.abs(idx - prev);

    useLayoutEffect(() => {
        if (idx !== null) {
            lastIndex.current = idx;
        }
    }, [idx]);

    if (value === null) {
        return (
            <p className={dash ? "mt-1 text-xl font-semibold tabular-nums" : "mt-0.5 text-lg font-semibold tabular-nums"}>
                —
            </p>
        );
    }

    return (
        <div
            className={dash ? "growcast-climate-wheel growcast-climate-wheel-dash" : "growcast-climate-wheel"}
            aria-hidden="true"
        >
            <div
                className="growcast-climate-wheel-strip"
                style={{
                    transform: `translateY(calc((1 - ${idx}) * var(--row)))`,
                    transitionDuration: `${climateTickDurationMs(dist, reduced)}ms`,
                    transitionTimingFunction: CLIMATE_TICK_EASING,
                }}
            >
                {labels.map((label) => (
                    <div className="growcast-climate-wheel-row" key={label}>
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}
