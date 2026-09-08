import type {ReactNode} from "react";
import OverlayCamera from "@/components/overlay-camera";
import OverlayWatermark from "@/components/overlay-watermark";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {overlayHudScaleStyle} from "@/lib/overlay-scale";
import {overlayStreamEmbeds, type OverlayStream} from "@/lib/overlay-stream";
import {EMPTY_CAMERA_LOOK, type CameraLook} from "@/lib/restream/camera-look";
import {safeHttpUrlOrEmpty} from "@/lib/url-policy";

export const OVERLAY_PANEL_CLASS =
    "rounded-2xl bg-[rgba(9,9,11,0.72)] px-4 py-3 text-zinc-100 shadow-lg backdrop-blur-[6px]";

export default function OverlayShell({
    layout,
    overlayStream,
    overlayScalePct,
    streamUrl,
    look = EMPTY_CAMERA_LOOK,
    children,
}: {
    layout: OverlayLayout;
    overlayStream: OverlayStream;
    overlayScalePct: number;
    streamUrl: string;
    look?: CameraLook;
    children: ReactNode;
}) {
    const bar = layout === "bottom-bar";
    const embed = overlayStreamEmbeds(overlayStream, streamUrl);
    const safeStream = safeHttpUrlOrEmpty(streamUrl);
    const scaleStyle = overlayHudScaleStyle(overlayScalePct, layout);

    return (
        <div className="relative h-full w-full overflow-hidden bg-transparent">
            {embed && safeStream ? (
                <div className="absolute inset-0 z-0">
                    <OverlayCamera streamUrl={safeStream} look={look} />
                </div>
            ) : null}
            <div
                className={
                    bar
                        ? "absolute inset-x-0 bottom-0 z-10 flex flex-row items-stretch gap-3 p-6"
                        : "absolute inset-y-0 left-0 z-10 flex w-[min(22rem,32vw)] flex-col items-stretch gap-3 p-6"
                }
                style={scaleStyle}
            >
                {children}
            </div>
            <OverlayWatermark layout={layout}/>
        </div>
    );
}
