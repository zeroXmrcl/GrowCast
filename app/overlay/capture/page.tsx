import {notFound} from "next/navigation";
import ProgramScene from "@/components/program-scene";
import {getCurrentGrow} from "@/lib/db";
import {
    captureStreamUrl,
    ensureRestreamCaptureToken,
    isRestreamCaptureAuthorized,
} from "@/lib/restream/capture";

export const dynamic = "force-dynamic";

export default async function OverlayCapturePage({
    searchParams,
}: {
    searchParams: Promise<{token?: string}>;
}) {
    const params = await searchParams;
    const expected = await ensureRestreamCaptureToken();
    if (!isRestreamCaptureAuthorized(expected, params.token)) {
        notFound();
    }

    const grow = await getCurrentGrow();
    return (
        <ProgramScene
            plant={grow.plant}
            name={grow.name}
            seededAt={grow.details.seededAt}
            overlayLayout={grow.overlayLayout}
            overlayScalePct={grow.overlayScalePct}
            streamUrl={captureStreamUrl(grow.streamUrl)}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
            captureToken={params.token}
        />
    );
}
