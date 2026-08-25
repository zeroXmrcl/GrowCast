"use client";

import {useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode} from "react";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {
    OVERLAY_EASING_ENTER,
    OVERLAY_EASING_LEAVE,
    OVERLAY_ENTER_MS,
    OVERLAY_LEAVE_MS,
    overlaySlideTransform,
    overlayStaggerMs,
} from "@/lib/overlay-motion";

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

export default function OverlayMotionItem({
    show,
    order,
    layout,
    children,
}: {
    show: boolean;
    order: number;
    layout: OverlayLayout;
    children: ReactNode;
}) {
    const reduced = usePrefersReducedMotion();
    const [mounted, setMounted] = useState(show);
    const [entered, setEntered] = useState(false);

    if (show && !mounted) {
        setMounted(true);
    }

    useEffect(() => {
        if (show) {
            let cancelled = false;
            const frame = requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!cancelled) {
                        setEntered(true);
                    }
                });
            });
            return () => {
                cancelled = true;
                cancelAnimationFrame(frame);
            };
        }
        const timeout = window.setTimeout(() => {
            setMounted(false);
            setEntered(false);
        }, OVERLAY_LEAVE_MS);
        return () => window.clearTimeout(timeout);
    }, [show]);

    if (!mounted) {
        return null;
    }

    const visible = show && entered;
    const bar = layout === "bottom-bar";
    const durationMs = visible ? OVERLAY_ENTER_MS : OVERLAY_LEAVE_MS;
    const easing = visible ? OVERLAY_EASING_ENTER : OVERLAY_EASING_LEAVE;
    const delayMs = visible ? overlayStaggerMs(order, reduced) : 0;
    const hiddenTransform = overlaySlideTransform(layout, reduced);
    const style: CSSProperties = {
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : hiddenTransform,
        transitionProperty: reduced ? "opacity" : "opacity, transform, grid-template-rows, grid-template-columns",
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: easing,
        transitionDelay: `${delayMs}ms`,
        display: "grid",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        ...(bar
            ? {gridTemplateColumns: visible ? "1fr" : "0fr"}
            : {gridTemplateRows: visible ? "1fr" : "0fr"}),
    };

    return (
        <div style={style}>
            <div className="min-h-0 min-w-0 overflow-hidden">{children}</div>
        </div>
    );
}
