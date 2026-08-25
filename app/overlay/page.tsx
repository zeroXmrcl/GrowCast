import OverlayHud from "@/components/overlay-hud";
import {getCurrentGrow} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OverlayPage() {
    const grow = await getCurrentGrow();
    return (
        <OverlayHud
            plant={grow.plant}
            name={grow.name}
            seededAt={grow.details.seededAt}
            overlayLayout={grow.overlayLayout}
            overlayStream={grow.overlayStream}
            streamUrl={grow.streamUrl}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
        />
    );
}
