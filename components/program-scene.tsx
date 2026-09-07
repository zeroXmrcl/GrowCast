import OverlayAlertLayer from "@/components/overlay-alert-layer";
import OverlayHud from "@/components/overlay-hud";
import OverlayMusicWave from "@/components/overlay-music-wave";
import ProgramAudio from "@/components/program-audio";
import {ProgramAudioGraphProvider} from "@/components/program-audio-graph";
import type {OverlayGrowView} from "@/lib/overlay-grow";

export default function ProgramScene({
    plant,
    name,
    seededAt,
    overlayLayout,
    overlayScalePct,
    streamUrl,
    stage,
    lightSchedule,
    strain,
    captureToken,
}: Omit<OverlayGrowView, "overlayStream"> & {captureToken?: string}) {
    return (
        <ProgramAudioGraphProvider>
            <div className="relative h-full w-full">
                <OverlayHud
                    plant={plant}
                    name={name}
                    seededAt={seededAt}
                    overlayLayout={overlayLayout}
                    overlayStream="include"
                    lockStream
                    overlayScalePct={overlayScalePct}
                    streamUrl={streamUrl}
                    stage={stage}
                    lightSchedule={lightSchedule}
                    strain={strain}
                    extra={<OverlayMusicWave layout={overlayLayout} />}
                />
                <OverlayAlertLayer layout={overlayLayout} captureToken={captureToken} />
                <ProgramAudio captureToken={captureToken} />
            </div>
        </ProgramAudioGraphProvider>
    );
}
