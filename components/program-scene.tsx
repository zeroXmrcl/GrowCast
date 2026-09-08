import OverlayAlertLayer from "@/components/overlay-alert-layer";
import OverlayMusicWave from "@/components/overlay-music-wave";
import ProgramAudio from "@/components/program-audio";
import {ProgramAudioGraphProvider} from "@/components/program-audio-graph";
import ProgramCameraLook from "@/components/program-camera-look";
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
                <ProgramCameraLook
                    plant={plant}
                    name={name}
                    seededAt={seededAt}
                    overlayLayout={overlayLayout}
                    lockStream
                    overlayScalePct={overlayScalePct}
                    streamUrl={streamUrl}
                    stage={stage}
                    lightSchedule={lightSchedule}
                    strain={strain}
                    extra={<OverlayMusicWave layout={overlayLayout} />}
                    captureToken={captureToken}
                />
                <OverlayAlertLayer layout={overlayLayout} captureToken={captureToken} />
                <ProgramAudio captureToken={captureToken} />
            </div>
        </ProgramAudioGraphProvider>
    );
}
