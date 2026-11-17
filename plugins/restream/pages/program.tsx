"use client";

import {useEffect, useState, type ReactNode} from "react";
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

function ProgramPreview({children}: {children?: ReactNode}) {
    const [scene, setScene] = useState<Omit<OverlayGrowView, "overlayStream"> | null>(null);

    useEffect(() => {
        void fetch("/api/data/plugins/restream/scene", {cache: "no-store", credentials: "include"})
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
        >
            {children}
        </ProgramScene>
    );
}

/** Preview is admin-only; Host API scene requires isAdminAuthenticated. */
export default function ProgramPage() {
    return (
        <ProgramPreview>
            <OverlayWidgets />
        </ProgramPreview>
    );
}
