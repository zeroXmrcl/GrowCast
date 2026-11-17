import OverlayHud from "@/components/overlay-hud";
import PluginWidgets from "@/components/plugin-widgets";
import {getCurrentGrow} from "@/lib/db";
import {readCameraLook} from "@/plugins/restream/host/camera-look-store";

export const dynamic = "force-dynamic";

export default async function OverlayPage() {
    const [grow, look] = await Promise.all([getCurrentGrow(), readCameraLook()]);
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
            look={look}
        >
            <PluginWidgets slot="overlay" />
        </OverlayHud>
    );
}
