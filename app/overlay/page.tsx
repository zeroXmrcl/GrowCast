import OverlayHud from "@/components/overlay-hud";
import {getCurrentGrow} from "@/lib/db";
import {readCameraLook} from "@/lib/restream/camera-look";

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
            streamUrl={grow.streamUrl}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
            look={look}
        />
    );
}
