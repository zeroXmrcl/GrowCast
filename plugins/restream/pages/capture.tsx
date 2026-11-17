import {notFound} from "next/navigation";
import PluginWidgets from "@/components/plugin-widgets";
import ProgramScene from "@/plugins/restream/ui/program-scene";
import {getCurrentGrow} from "@/lib/db";
import {
    captureStreamUrl,
    ensureRestreamCaptureToken,
    isRestreamCaptureAuthorized,
} from "@/plugins/restream/host/capture";

export const dynamic = "force-dynamic";

export default async function OverlayCapturePage({
    searchParams,
}: {
    searchParams?: Promise<{token?: string}>;
}) {
    const params = (await searchParams) ?? {};
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
            climateTick={grow.climateTick}
            devicesDesign={grow.devicesDesign}
            streamUrl={captureStreamUrl(grow.streamUrl)}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
            captureToken={params.token}
        >
            <PluginWidgets slot="overlay" />
        </ProgramScene>
    );
}
