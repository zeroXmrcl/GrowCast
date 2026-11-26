"use client";

import {useEffect, useState, type CSSProperties, type ReactNode} from "react";
import OverlayIdentity from "@/components/overlay-identity";
import OverlayMotionItem from "@/components/overlay-motion-item";
import OverlayShell from "@/components/overlay-shell";
import {OverlayLayoutProvider} from "@/components/overlay-layout-context";
import {
    OVERLAY_GROW_PATH,
    OVERLAY_GROW_POLL_MS,
    mergeOverlayGrowPoll,
    parseOverlayGrowBody,
    type OverlayGrowView,
} from "@/lib/overlay-grow";
import {OVERLAY_ORDER_IDENTITY} from "@/lib/overlay-motion";

export default function OverlayHud({
    lockStream = false,
    extra,
    children,
    lookCss,
    temperatureStyle,
    ...initial
}: OverlayGrowView & {
    lockStream?: boolean;
    extra?: ReactNode;
    children?: ReactNode;
    lookCss?: string;
    temperatureStyle?: CSSProperties;
}) {
    const [grow, setGrow] = useState<OverlayGrowView>(initial);
    const layout = grow.overlayLayout;

    useEffect(() => {
        let cancelled = false;

        async function tick() {
            try {
                const response = await fetch(OVERLAY_GROW_PATH, {cache: "no-store"});
                if (!response.ok) {
                    return;
                }
                const next = parseOverlayGrowBody(await response.json());
                if (!cancelled && next) {
                    setGrow((current) => mergeOverlayGrowPoll(current, next, lockStream));
                }
            } catch {
            }
        }

        void tick();
        const id = window.setInterval(() => {
            void tick();
        }, OVERLAY_GROW_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [lockStream]);

    return (
        <OverlayLayoutProvider layout={layout}>
            <OverlayShell
                layout={layout}
                overlayStream={grow.overlayStream}
                overlayScalePct={grow.overlayScalePct}
                streamUrl={grow.streamUrl}
                lookCss={lookCss}
                temperatureStyle={temperatureStyle}
            >
                <OverlayMotionItem show={true} order={OVERLAY_ORDER_IDENTITY} layout={layout}>
                    <OverlayIdentity
                        plant={grow.plant}
                        name={grow.name}
                        seededAt={grow.seededAt}
                        stage={grow.stage}
                        lightSchedule={grow.lightSchedule}
                        strain={grow.strain}
                    />
                </OverlayMotionItem>
                {children}
                {extra}
            </OverlayShell>
        </OverlayLayoutProvider>
    );
}
