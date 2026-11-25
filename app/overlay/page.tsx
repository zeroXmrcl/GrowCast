import type {CSSProperties} from "react";
import OverlayHud from "@/components/overlay-hud";
import PluginWidgets from "@/components/plugin-widgets";
import {getCurrentGrow} from "@/lib/db";
import {loadPluginOverlayLook} from "@/lib/plugins/hooks";

export const dynamic = "force-dynamic";

export default async function OverlayPage() {
    const [grow, look] = await Promise.all([getCurrentGrow(), loadPluginOverlayLook()]);
    return (
        <OverlayHud
            plant={grow.plant}
            name={grow.name}
            seededAt={grow.details.seededAt}
            overlayLayout={grow.overlayLayout}
            overlayStream={grow.overlayStream}
            overlayScalePct={grow.overlayScalePct}
            climateTick={grow.climateTick}
            devicesDesign={grow.devicesDesign}
            streamUrl={grow.streamUrl}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
            lookCss={look?.lookCss}
            temperatureStyle={look?.temperatureStyle as CSSProperties | undefined}
        >
            <PluginWidgets slot="overlay" />
        </OverlayHud>
    );
}
