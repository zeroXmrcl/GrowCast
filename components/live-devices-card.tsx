import {DeviceIcon} from "@/components/device-icons";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {mapDeviceTiles, type LiveDeviceTile} from "@/lib/live-climate-view";
import {
    LIVE_DEVICE_ITEM_CLASS,
    LIVE_DEVICE_ROW_CLASS,
    LIVE_DEVICE_VOID_CLASS,
    liveDeviceRowItems,
} from "@/lib/live-devices-layout";

type LiveDevicesCardProps = {
    snapshot: GgsLivePublic;
};

function DeviceTile({tile}: {tile: LiveDeviceTile}) {
    const running = tile.running;

    return (
        <div
            className="flex w-full min-w-0 flex-col items-center gap-1"
            role="img"
            title={tile.accessibleName}
            aria-label={tile.accessibleName}
        >
            <div
                className={`flex h-12 w-12 max-w-full items-center justify-center rounded-xl ${
                    running
                        ? "bg-[#fff7ed] dark:bg-orange-950/50"
                        : "bg-zinc-100 dark:bg-zinc-800"
                }`}
            >
                <DeviceIcon
                    kind={tile.kind}
                    className={running ? "text-[#ea580c]" : "text-[#a1a1aa]"}
                />
            </div>
            <span
                className={`w-full truncate text-center text-xs leading-tight ${
                    running
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500 dark:text-zinc-400"
                }`}
            >
                {tile.label}
            </span>
            <span
                className={`text-center text-[11px] tabular-nums ${
                    running
                        ? "text-zinc-700 dark:text-zinc-300"
                        : "text-zinc-500 dark:text-zinc-400"
                }`}
            >
                {tile.levelText}
            </span>
        </div>
    );
}

export default function LiveDevicesCard({snapshot}: LiveDevicesCardProps) {
    const tiles = mapDeviceTiles(snapshot);

    return (
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Devices</h2>
            {tiles.length > 0 ? (
                <ul className={LIVE_DEVICE_ROW_CLASS}>
                    {liveDeviceRowItems(tiles).map((item) =>
                        item.kind === "void" ? (
                            <li
                                key={item.key}
                                aria-hidden="true"
                                className={LIVE_DEVICE_VOID_CLASS}
                            />
                        ) : (
                            <li key={item.key} className={LIVE_DEVICE_ITEM_CLASS}>
                                <DeviceTile tile={item.tile}/>
                            </li>
                        ),
                    )}
                </ul>
            ) : null}
        </article>
    );
}
