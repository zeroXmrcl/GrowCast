import type {ReactNode} from "react";
import type {OverlayLayout} from "@/lib/overlay-layout";

export const OVERLAY_PANEL_CLASS =
    "rounded-2xl bg-[rgba(9,9,11,0.72)] px-4 py-3 text-zinc-100 shadow-lg backdrop-blur-[6px]";

export default function OverlayShell({
    layout,
    children,
}: {
    layout: OverlayLayout;
    children: ReactNode;
}) {
    const bar = layout === "bottom-bar";

    return (
        <div className="h-screen w-screen overflow-hidden bg-transparent">
            <div
                className={
                    bar
                        ? "absolute inset-x-0 bottom-0 flex flex-row items-stretch gap-3 p-6"
                        : "absolute inset-y-0 left-0 flex w-[min(22rem,32vw)] flex-col items-stretch gap-3 p-6"
                }
            >
                {children}
            </div>
        </div>
    );
}
