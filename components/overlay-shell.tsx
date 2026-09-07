import type {ReactNode} from "react";
import OverlayWatermark from "@/components/overlay-watermark";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {overlayHudScaleStyle} from "@/lib/overlay-scale";
import {overlayStreamEmbeds, type OverlayStream} from "@/lib/overlay-stream";
import {safeHttpUrlOrEmpty} from "@/lib/url-policy";

export const OVERLAY_PANEL_CLASS =
    "rounded-2xl bg-[rgba(9,9,11,0.72)] px-4 py-3 text-zinc-100 shadow-lg backdrop-blur-[6px]";

export default function OverlayShell({
    layout,
    overlayStream,
    overlayScalePct,
    streamUrl,
    children,
}: {
    layout: OverlayLayout;
    overlayStream: OverlayStream;
    overlayScalePct: number;
    streamUrl: string;
    children: ReactNode;
}) {
    const bar = layout === "bottom-bar";
    const embed = overlayStreamEmbeds(overlayStream, streamUrl);
    const safeStream = safeHttpUrlOrEmpty(streamUrl);
    const scaleStyle = overlayHudScaleStyle(overlayScalePct, layout);

    return (
        <div className="relative h-full w-full overflow-hidden bg-transparent">
            {embed && safeStream ? (
                <iframe
                    className="absolute inset-0 h-full w-full border-0"
                    src={safeStream}
                    allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    title="Grow stream"
                />
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
