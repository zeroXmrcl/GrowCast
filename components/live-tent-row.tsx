"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import ClimateHistoryDialog from "@/components/climate-history-dialog";
import LiveClimateCard from "@/components/live-climate-card";
import LiveDevicesCard from "@/components/live-devices-card";
import {useLiveClimate} from "@/hooks/use-live-climate";
import type {ClimateTick} from "@/lib/climate-tick";
import type {ClimateHistoryPublic} from "@/lib/climate/history-public";
import {DEFAULT_DEVICES_DESIGN, type DevicesDesign} from "@/lib/devices-design";
import {
    OVERLAY_GROW_PATH,
    OVERLAY_GROW_POLL_MS,
    parseOverlayGrowBody,
} from "@/lib/overlay-grow";
import {shouldShowLiveRow} from "@/lib/live-climate-view";
import {WORKSPACE_AREA, WORKSPACE_VT} from "@/lib/workspace";

export default function LiveTentRow({
    climateTick: initialTick = "plain",
    devicesDesign: initialDesign = DEFAULT_DEVICES_DESIGN,
    history,
}: {
    climateTick?: ClimateTick;
    devicesDesign?: DevicesDesign;
    history: ClimateHistoryPublic;
}) {
    const {snapshot, stale} = useLiveClimate();
    const [climateTick, setClimateTick] = useState(initialTick);
    const [devicesDesign, setDevicesDesign] = useState(initialDesign);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [origin, setOrigin] = useState({x: 0, y: 0});
    const [board, setBoard] = useState<Element | null>(null);

    useEffect(() => {
        setClimateTick(initialTick);
    }, [initialTick]);

    useEffect(() => {
        setDevicesDesign(initialDesign);
    }, [initialDesign]);

    useEffect(() => {
        const abort = new AbortController();
        async function poll() {
            try {
                const response = await fetch(OVERLAY_GROW_PATH, {
                    cache: "no-store",
                    signal: abort.signal,
                });
                if (!response.ok) {
                    return;
                }
                const parsed = parseOverlayGrowBody(await response.json());
                if (parsed) {
                    setClimateTick(parsed.climateTick);
                    setDevicesDesign(parsed.devicesDesign);
                }
            } catch {
                // next interval retries
            }
        }
        void poll();
        const timer = window.setInterval(poll, OVERLAY_GROW_POLL_MS);
        return () => {
            abort.abort();
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (!shouldShowLiveRow(snapshot) && historyOpen) {
            setHistoryOpen(false);
        }
    }, [snapshot, historyOpen]);

    function openHistory(button: HTMLButtonElement) {
        const target = document.querySelector(".growcast-board");
        if (!target) {
            return;
        }
        const boardRect = target.getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        setOrigin({
            x: rect.left + rect.width / 2 - boardRect.left,
            y: rect.top + rect.height / 2 - boardRect.top,
        });
        setBoard(target);
        setHistoryOpen(true);
    }

    if (!shouldShowLiveRow(snapshot)) {
        return null;
    }

    const dialog = historyOpen && board
        ? createPortal(
            <ClimateHistoryDialog
                history={history}
                origin={origin}
                onClose={() => setHistoryOpen(false)}
            />,
            board,
        )
        : null;

    return (
        <>
            <section className={`${WORKSPACE_AREA.live} ${WORKSPACE_VT.mid} grid lg:grid-cols-2`}>
                <LiveClimateCard
                    snapshot={snapshot}
                    stale={stale}
                    climateTick={climateTick}
                    historyOpen={historyOpen}
                    onHistory={openHistory}
                />
                <LiveDevicesCard snapshot={snapshot} devicesDesign={devicesDesign}/>
            </section>
            {dialog}
        </>
    );
}
