"use client";

import {useEffect, useState} from "react";
import OverlayClimate from "@/components/overlay-climate";
import OverlayEnergy from "@/components/overlay-energy";
import OverlayGear from "@/components/overlay-gear";
import OverlayIdentity from "@/components/overlay-identity";
import OverlayMotionItem from "@/components/overlay-motion-item";
import OverlayShell from "@/components/overlay-shell";
import {useLiveClimate} from "@/hooks/use-live-climate";
import {ENERGY_POLL_MS, fetchEnergyDto} from "@/lib/energy/poll";
import type {EnergyPublicDto} from "@/lib/energy/types";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {
    OVERLAY_GROW_PATH,
    OVERLAY_GROW_POLL_MS,
    parseOverlayGrowBody,
    type OverlayGrowView,
} from "@/lib/overlay-grow";
import {
    OVERLAY_ORDER_CLIMATE,
    OVERLAY_ORDER_ENERGY,
    OVERLAY_ORDER_GEAR,
    OVERLAY_ORDER_IDENTITY,
} from "@/lib/overlay-motion";
import {
    applyOverlayEnergyPoll,
    overlayClimateGearVisible,
    overlayEnergyVisible,
} from "@/lib/overlay-presence";

export default function OverlayHud(initial: OverlayGrowView) {
    const [grow, setGrow] = useState<OverlayGrowView>(initial);
    const [energy, setEnergy] = useState<EnergyPublicDto | null>(null);
    const [heldSnapshot, setHeldSnapshot] = useState<GgsLivePublic | null>(null);
    const [heldEnergy, setHeldEnergy] = useState<EnergyPublicDto | null>(null);
    const {snapshot, stale, nowMs} = useLiveClimate();
    const showClimateGear = overlayClimateGearVisible(snapshot);
    const showEnergy = overlayEnergyVisible(energy);
    const layout = grow.overlayLayout;

    if (showClimateGear && snapshot && heldSnapshot !== snapshot) {
        setHeldSnapshot(snapshot);
    }
    if (showEnergy && energy && heldEnergy !== energy) {
        setHeldEnergy(energy);
    }

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
                    setGrow(next);
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
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function tick() {
            const next = await fetchEnergyDto();
            if (!cancelled) {
                setEnergy((current) => applyOverlayEnergyPoll(current, next));
            }
        }

        void tick();
        const id = window.setInterval(() => {
            void tick();
        }, ENERGY_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    return (
        <OverlayShell
            layout={layout}
            overlayStream={grow.overlayStream}
            overlayScalePct={grow.overlayScalePct}
            streamUrl={grow.streamUrl}
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
            <OverlayMotionItem
                show={showClimateGear}
                order={OVERLAY_ORDER_CLIMATE}
                layout={layout}
            >
                {heldSnapshot ? (
                    <OverlayClimate snapshot={heldSnapshot} stale={stale} nowMs={nowMs}/>
                ) : null}
            </OverlayMotionItem>
            <OverlayMotionItem
                show={showClimateGear}
                order={OVERLAY_ORDER_GEAR}
                layout={layout}
            >
                {heldSnapshot ? <OverlayGear snapshot={heldSnapshot}/> : null}
            </OverlayMotionItem>
            <OverlayMotionItem
                show={showEnergy}
                order={OVERLAY_ORDER_ENERGY}
                layout={layout}
            >
                {heldEnergy ? <OverlayEnergy dto={heldEnergy}/> : null}
            </OverlayMotionItem>
        </OverlayShell>
    );
}
