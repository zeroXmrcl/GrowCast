import {DeviceIcon} from "@/components/device-icons";
import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {mapDeviceTiles} from "@/lib/live-climate-view";
import {OVERLAY_CHIP_COLOR_MS} from "@/lib/overlay-motion";

export default function OverlayGear({snapshot}: {snapshot: GgsLivePublic}) {
    const tiles = mapDeviceTiles(snapshot);

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            {tiles.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                    {tiles.map((tile) => {
                        const running = tile.running;
                        return (
                            <li key={tile.id}>
                                <div
                                    className={`flex min-w-[3.5rem] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors ${
                                        running
                                            ? "bg-orange-500/20 text-orange-200"
                                            : "bg-zinc-800/80 text-zinc-400"
                                    }`}
                                    style={{transitionDuration: `${OVERLAY_CHIP_COLOR_MS}ms`}}
                                    role="img"
                                    title={tile.accessibleName}
                                    aria-label={tile.accessibleName}
                                >
                                    <DeviceIcon
                                        kind={tile.kind}
                                        className={running ? "text-orange-300" : "text-zinc-500"}
                                    />
                                    <span className="text-center text-[10px] leading-tight">
                                        {tile.label}
                                    </span>
                                    <span className="text-center text-[11px] tabular-nums">
                                        {tile.levelText}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </section>
    );
}
