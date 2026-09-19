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
    const wheelRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const lastIndex = useRef<number | null>(null);
    const labels = climateTickLabels(kind);
    const dash = size === "dash";

    useLayoutEffect(() => {
        const wheel = wheelRef.current;
        const strip = stripRef.current;
        if (!wheel || !strip || value === null) {
            return;
        }
        const row = strip.firstElementChild as HTMLElement | null;
        if (!row) {
            return;
        }
        const idx = climateTickIndex(kind, value);
        const y = wheel.clientHeight / 2 - row.clientHeight / 2 - idx * row.clientHeight;
        const prev = lastIndex.current;
        const dist = prev === null ? 0 : Math.abs(idx - prev);
        lastIndex.current = idx;
        strip.style.transitionDuration = `${climateTickDurationMs(dist, reduced)}ms`;
        strip.style.transitionTimingFunction = CLIMATE_TICK_EASING;
        strip.style.transform = `translateY(${y}px)`;
    }, [kind, reduced, value]);

    if (value === null) {
        return (
            <p className={dash ? "mt-1 text-xl font-semibold tabular-nums" : "mt-0.5 text-lg font-semibold tabular-nums"}>
                —
            </p>
        );
    }

    return (
        <div
            ref={wheelRef}
            className={dash ? "growcast-climate-wheel growcast-climate-wheel-dash" : "growcast-climate-wheel"}
            aria-hidden="true"
        >
            <div ref={stripRef} className="growcast-climate-wheel-strip">
                {labels.map((label) => (
                    <div className="growcast-climate-wheel-row" key={label}>
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}
