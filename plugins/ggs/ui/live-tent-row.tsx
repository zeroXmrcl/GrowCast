"use client";

import {useEffect, useRef, useState} from "react";
import ClimateHistoryDialog from "@/plugins/ggs/ui/climate-history-dialog";
import LiveClimateCard from "@/plugins/ggs/ui/live-climate-card";
import LiveDevicesCard from "@/plugins/ggs/ui/live-devices-card";
import {useLiveClimate} from "@/plugins/ggs/ui/use-live-climate";
import type {ClimateTick} from "@/plugins/ggs/host/climate-tick";
import type {ClimateHistoryPublic} from "@/plugins/ggs/host/climate/history-public";
import type {ClimateHistoryMetric} from "@/plugins/ggs/host/climate/history-ui";
import {DEFAULT_DEVICES_DESIGN, type DevicesDesign} from "@/plugins/ggs/host/devices-design";
import {
    OVERLAY_GROW_PATH,
    OVERLAY_GROW_POLL_MS,
    parseOverlayGrowBody,
} from "@/lib/overlay-grow";
import {shouldShowLiveRow} from "@/plugins/ggs/host/live-climate-view";
import {emptyClimateHistory} from "@/plugins/ggs/host/climate/history-public";
import {WORKSPACE_AREA, WORKSPACE_VT} from "@/lib/workspace";

export default function LiveTentRow({
    climateTick: initialTick = "plain",
    devicesDesign: initialDesign = DEFAULT_DEVICES_DESIGN,
    history = emptyClimateHistory(),
    preview = false,
}: {
    climateTick?: ClimateTick;
    devicesDesign?: DevicesDesign;
    history?: ClimateHistoryPublic;
    preview?: boolean;
}) {
    const {snapshot, stale} = useLiveClimate();
    const [climateTick, setClimateTick] = useState(initialTick);
    const [seenTick, setSeenTick] = useState(initialTick);
    if (initialTick !== seenTick) {
        setSeenTick(initialTick);
        setClimateTick(initialTick);
    }
    const [devicesDesign, setDevicesDesign] = useState(initialDesign);
    const [seenDesign, setSeenDesign] = useState(initialDesign);
    if (initialDesign !== seenDesign) {
        setSeenDesign(initialDesign);
        setDevicesDesign(initialDesign);
    }
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyMetric, setHistoryMetric] = useState<ClimateHistoryMetric>("tempC");
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const rowVisible = shouldShowLiveRow(snapshot);
    const [seenRow, setSeenRow] = useState(rowVisible);
    if (rowVisible !== seenRow) {
        setSeenRow(rowVisible);
        if (!rowVisible) {
            setHistoryOpen(false);
        }
    }

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

    function openHistory(metric: ClimateHistoryMetric, button: HTMLButtonElement) {
        triggerRef.current = button;
        setHistoryMetric(metric);
        setHistoryOpen(true);
    }

    function closeHistory() {
        setHistoryOpen(false);
        const trigger = triggerRef.current;
        if (trigger) {
            window.requestAnimationFrame(() => trigger.focus());
        }
    }

    if (!shouldShowLiveRow(snapshot)) {
        return null;
    }

    return (
        <>
            <section className={`${WORKSPACE_AREA.live} ${WORKSPACE_VT.mid} grid lg:grid-cols-2`}>
                <LiveClimateCard
                    snapshot={snapshot}
                    stale={stale}
                    climateTick={climateTick}
                    historyOpen={historyOpen}
                    historyMetric={historyMetric}
                    onOpenHistory={openHistory}
                    preview={preview}
                />
                <LiveDevicesCard snapshot={snapshot} devicesDesign={devicesDesign}/>
            </section>
            {historyOpen ? (
                <ClimateHistoryDialog
                    history={history}
                    metric={historyMetric}
                    onMetricChange={setHistoryMetric}
                    onClose={closeHistory}
                />
            ) : null}
        </>
    );
}
