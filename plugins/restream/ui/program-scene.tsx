import type {ReactNode} from "react";
import OverlayAlertLayer from "@/plugins/restream/ui/overlay-alert-layer";
import OverlayMusicWave from "@/plugins/restream/ui/overlay-music-wave";
import ProgramAudio from "@/plugins/restream/ui/program-audio";
import {ProgramAudioGraphProvider} from "@/plugins/restream/ui/program-audio-graph";
import ProgramCameraLook from "@/plugins/restream/ui/program-camera-look";
import type {OverlayGrowView} from "@/lib/overlay-grow";

export default function ProgramScene({
    plant,
    name,
    seededAt,
    overlayLayout,
    overlayScalePct,
    climateTick,
    devicesDesign,
    streamUrl,
    stage,
    lightSchedule,
    strain,
    captureToken,
    children,
}: Omit<OverlayGrowView, "overlayStream"> & {captureToken?: string; children?: ReactNode}) {
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
                    climateTick={climateTick}
                    devicesDesign={devicesDesign}
                    streamUrl={streamUrl}
                    stage={stage}
                    lightSchedule={lightSchedule}
                    strain={strain}
                    extra={(
                        <>
                            {children}
                            <OverlayMusicWave layout={overlayLayout} />
                        </>
                    )}
                    captureToken={captureToken}
                />
                <OverlayAlertLayer layout={overlayLayout} captureToken={captureToken} />
                <ProgramAudio captureToken={captureToken} />
            </div>
        </ProgramAudioGraphProvider>
    );
}
