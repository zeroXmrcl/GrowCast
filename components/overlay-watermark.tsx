import type {OverlayLayout} from "@/lib/overlay-layout";

export default function OverlayWatermark({layout}: {layout: OverlayLayout}) {
    const corner =
        layout === "bottom-bar"
            ? "absolute right-6 top-6"
            : "absolute right-6 bottom-6";

    return (
        <div
            className={`${corner} z-10 flex items-center gap-3 pointer-events-none`}
            style={{
                filter:
                    "drop-shadow(0 1px 2px rgba(0,0,0,0.95)) drop-shadow(0 0 10px rgba(0,0,0,0.8))",
            }}
            aria-hidden="true"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/growCastLogo_green.svg" alt="" width={40} height={40} />
            <span className="text-[28px] font-semibold tracking-tight text-zinc-50">
                GrowCast
            </span>
        </div>
    );
}
