import {notFound} from "next/navigation";
import OverlayHud from "@/components/overlay-hud";
import {getCurrentGrow} from "@/lib/db";
import {
    captureStreamUrl,
    getRestreamTokenFromEnv,
    isRestreamCaptureAuthorized,
} from "@/lib/restream/capture";

export const dynamic = "force-dynamic";

export default async function OverlayCapturePage({
    searchParams,
}: {
    searchParams: Promise<{token?: string}>;
}) {
    const params = await searchParams;
    if (!isRestreamCaptureAuthorized(getRestreamTokenFromEnv(), params.token)) {
        notFound();
    }

    const grow = await getCurrentGrow();
    return (
        <OverlayHud
            plant={grow.plant}
            name={grow.name}
            seededAt={grow.details.seededAt}
            overlayLayout={grow.overlayLayout}
            overlayStream="include"
            lockStream
            overlayScalePct={grow.overlayScalePct}
            streamUrl={captureStreamUrl(grow.streamUrl)}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
        />
    );
}
