"use client";

import {useEffect, useState, type ReactNode} from "react";
import {usePluginRuntime} from "@growcast/plugin-sdk/ui";
import PluginMount from "@/components/plugin-mount";
import ProgramScene from "@/plugins/restream/ui/program-scene";
import type {OverlayGrowView} from "@/lib/overlay-grow";

type WidgetMount = {
    pluginId: string;
    widgetId: string;
    version: string;
    entry?: string;
    webComponent?: string;
    styles?: string[];
};

function OverlayWidgets() {
    const [widgets, setWidgets] = useState<WidgetMount[]>([]);
    useEffect(() => {
        void fetch("/api/data/plugin-widgets?slot=overlay", {cache: "no-store"})
            .then((response) => (response.ok ? response.json() : null))
            .then((raw) => {
                if (raw && Array.isArray(raw.widgets)) {
                    setWidgets(raw.widgets as WidgetMount[]);
                }
            })
            .catch(() => undefined);
    }, []);
    return (
        <>
            {widgets.map((item) => (
                <PluginMount
                    key={`${item.pluginId}:${item.widgetId}`}
                    pluginId={item.pluginId}
                    version={item.version}
                    entry={item.entry}
                    webComponent={item.webComponent}
                    styles={item.styles}
                    widgetId={item.widgetId}
                    role="visitor"
                    publicPage
                />
            ))}
        </>
    );
}

function CaptureScene({children}: {children?: ReactNode}) {
    const runtime = usePluginRuntime();
    const [scene, setScene] = useState<(Omit<OverlayGrowView, "overlayStream"> & {captureToken?: string}) | null>(
        (runtime.pageData as (Omit<OverlayGrowView, "overlayStream"> & {captureToken?: string}) | undefined) ?? null,
    );

    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get("token") ?? "";
        const qs = token ? `?token=${encodeURIComponent(token)}` : "";
        void fetch(`/api/data/plugins/restream/scene${qs}`, {cache: "no-store", credentials: "include"})
            .then((response) => (response.ok ? response.json() : null))
            .then((raw) => {
                if (raw) {
                    setScene(raw);
                }
            })
            .catch(() => undefined);
    }, []);

    if (!scene) {
        return null;
    }
    const grow = scene;
    return (
        <ProgramScene
            plant={grow.plant}
            name={grow.name}
            seededAt={grow.seededAt}
            overlayLayout={grow.overlayLayout}
            overlayScalePct={grow.overlayScalePct}
            climateTick={grow.climateTick}
            devicesDesign={grow.devicesDesign}
            streamUrl={grow.streamUrl}
            stage={grow.stage}
            lightSchedule={grow.lightSchedule}
            strain={grow.strain}
            captureToken={grow.captureToken}
        >
            {children}
        </ProgramScene>
    );
}

/** Host API authorizes with isRestreamCaptureAuthorized after ensureRestreamCaptureToken. */
export default function OverlayCapturePage() {
    return (
        <CaptureScene>
            <OverlayWidgets />
        </CaptureScene>
    );
}
