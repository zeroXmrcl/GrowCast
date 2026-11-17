"use client";

import {useEffect, useState} from "react";
import {definePlugin} from "@growcast/plugin-sdk/ui";
import LiveTentRow from "@/plugins/ggs/ui/live-tent-row";
import OverlayClimate from "@/plugins/ggs/ui/overlay-climate";
import OverlayGear from "@/plugins/ggs/ui/overlay-gear";
import OverlayEnergy from "@/plugins/ggs/ui/overlay-energy";
import {EnergyArchiveSection} from "@/plugins/ggs/ui/energy-scoreboard";
import {useLiveClimate} from "@/plugins/ggs/ui/use-live-climate";
import {ENERGY_POLL_MS, fetchEnergyDto} from "@/plugins/ggs/host/energy/poll";
import {OVERLAY_GROW_PATH, parseOverlayGrowBody} from "@/lib/overlay-grow";
import type {ClimateTick} from "@/plugins/ggs/host/climate-tick";
import type {EnergyPublicDto} from "@/plugins/ggs/host/energy/types";

function useClimateTick(): ClimateTick {
    const [climateTick, setClimateTick] = useState<ClimateTick>("plain");
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
                    setClimateTick(next.climateTick === "picker" ? "picker" : "plain");
                }
            } catch {
                /* next poll retries */
            }
        }
        void tick();
        const id = window.setInterval(() => void tick(), 5000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);
    return climateTick;
}

function LiveClimateWidget() {
    return <LiveTentRow />;
}

function OverlayClimateWidget() {
    const {snapshot, stale} = useLiveClimate();
    const climateTick = useClimateTick();
    if (!snapshot) {
        return null;
    }
    return <OverlayClimate snapshot={snapshot} stale={stale} climateTick={climateTick} />;
}

function OverlayGearWidget() {
    const {snapshot} = useLiveClimate();
    if (!snapshot) {
        return null;
    }
    return <OverlayGear snapshot={snapshot} />;
}

function OverlayEnergyWidget() {
    const [dto, setDto] = useState<EnergyPublicDto | null>(null);
    useEffect(() => {
        let cancelled = false;
        async function tick() {
            const next = await fetchEnergyDto();
            if (!cancelled) {
                setDto(next);
            }
        }
        void tick();
        const id = window.setInterval(() => void tick(), ENERGY_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);
    if (!dto) {
        return null;
    }
    return <OverlayEnergy dto={dto} />;
}

function ArchiveEnergyWidget() {
    const [dto, setDto] = useState<EnergyPublicDto | null>(null);
    useEffect(() => {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const archiveId = parts[0] === "grows" ? parts[1] : null;
        if (!archiveId) {
            return;
        }
        void fetch(`/api/data/plugins/ggs/energy?grow=${encodeURIComponent(archiveId)}&tariff=public`, {
            cache: "no-store",
        })
            .then((response) => response.ok ? response.json() : null)
            .then((raw) => {
                if (raw && raw.estimated === true) {
                    setDto(raw as EnergyPublicDto);
                }
            })
            .catch(() => undefined);
    }, []);
    if (!dto) {
        return null;
    }
    return <EnergyArchiveSection dto={dto} />;
}

export default definePlugin({
    pages: {},
    widgets: {
        "live-climate": LiveClimateWidget,
        "overlay-climate": OverlayClimateWidget,
        "overlay-gear": OverlayGearWidget,
        "overlay-energy": OverlayEnergyWidget,
        "archive-energy": ArchiveEnergyWidget,
    },
});
