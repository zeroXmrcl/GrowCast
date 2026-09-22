import {DeviceIcon} from "@/components/device-icons";
import type {GgsLivePublic} from "@/lib/ggs-live";
import {deviceGaugePercent} from "@/lib/device-gauge";
import type {DevicesDesign} from "@/lib/devices-design";
import {mapDeviceTiles, type LiveDeviceTile} from "@/lib/live-climate-view";
import {
    LIVE_DEVICE_ITEM_CLASS,
    LIVE_DEVICE_ROW_CLASS,
    LIVE_DEVICE_VOID_CLASS,
    liveDeviceRowItems,
} from "@/lib/live-devices-layout";
import {WORKSPACE_PAD, WORKSPACE_TITLE} from "@/lib/workspace";

const CX = 50;
const CY = 48;
const RADIUS = 30;
const ARC = Math.PI * RADIUS;
const TRACK = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 1 1 ${CX + RADIUS} ${CY}`;

type LiveDevicesCardProps = {
    snapshot: GgsLivePublic;
    devicesDesign?: DevicesDesign;
};

function DeviceTile({tile}: {tile: LiveDeviceTile}) {
    const alerting = tile.alerting;
    const running = tile.running && !alerting;

    return (
        <div
            className="flex w-full min-w-0 flex-col items-center gap-1"
            role="img"
            title={tile.accessibleName}
            aria-label={tile.accessibleName}
        >
            <div
                className={`flex h-12 w-12 max-w-full items-center justify-center rounded-xl ${
                    alerting
                        ? "growcast-alert-pulse bg-red-50 dark:bg-red-950/45"
                        : running
                          ? "bg-[#fff7ed] dark:bg-orange-950/50"
                          : "bg-zinc-100 dark:bg-zinc-800"
                }`}
            >
                <DeviceIcon
                    kind={tile.kind}
                    className={
                        alerting
                            ? "text-red-600 dark:text-red-400"
                            : running
                              ? "text-[#ea580c]"
                              : "text-[#a1a1aa]"
                    }
                />
            </div>
            <span
                className={`w-full truncate text-center text-xs leading-tight ${
                    alerting
                        ? "text-red-800 dark:text-red-200"
                        : running
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-500 dark:text-zinc-400"
                }`}
            >
                {tile.label}
            </span>
            <span
                className={`text-center text-[11px] tabular-nums ${
                    alerting
                        ? "font-semibold tracking-wide text-red-600 dark:text-red-400"
                        : running
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-500 dark:text-zinc-400"
                }`}
            >
                {tile.levelText}
            </span>
        </div>
    );
}

function DeviceGauge({tile}: {tile: LiveDeviceTile}) {
    const alerting = tile.alerting;
    const running = tile.running && !alerting;
    const percent = deviceGaugePercent(tile);
    const sweep = (percent / 100) * 180;

    return (
        <div className="min-w-0" title={tile.accessibleName} aria-label={tile.accessibleName}>
            <div className="flex flex-col items-center">
                <svg viewBox="0 0 100 62" className="aspect-[50/31] w-full" aria-hidden="true">
                    <path d={TRACK} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-zinc-200 dark:text-zinc-800"/>
                    <path
                        d={TRACK}
                        fill="none"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="growcast-turbine-power"
                        strokeDasharray={ARC}
                        strokeDashoffset={ARC * (1 - percent / 100)}
                    />
                    <g className="growcast-turbine-mark" style={{transform: `rotate(${sweep}deg)`}}>
                        <line
                            x1={CX}
                            y1={CY}
                            x2={CX - RADIUS + 4}
                            y2={CY}
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            className={running || alerting ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}
                        />
                        <circle
                            cx={CX}
                            cy={CY}
                            r="2.1"
                            className={running || alerting ? "fill-zinc-900 dark:fill-zinc-100" : "fill-zinc-400"}
                        />
                    </g>
                </svg>
                <p
                    className={`h-[1.15rem] text-center text-xs font-semibold tabular-nums leading-[1.15rem] ${
                        alerting
                            ? "tracking-wide text-red-600 dark:text-red-400"
                            : running
                              ? "text-zinc-900 dark:text-zinc-100"
                              : "font-medium text-zinc-500 dark:text-zinc-400"
                    }`}
                >
                    {tile.levelText}
                </p>
            </div>
            <p className="truncate text-center text-xs text-zinc-500 dark:text-zinc-400">{tile.label}</p>
        </div>
    );
}

export default function LiveDevicesCard({
    snapshot,
    devicesDesign = "needle",
}: LiveDevicesCardProps) {
    const tiles = mapDeviceTiles(snapshot);
    const icons = devicesDesign === "icons";

    return (
        <article className={`${WORKSPACE_PAD} flex flex-col`}>
            <div className="mb-4">
                <h2 className={`${WORKSPACE_TITLE} mb-0`}>Devices</h2>
            </div>
            {tiles.length > 0 ? (
                <div className="flex w-full flex-1 items-center">
                    {icons ? (
                        <ul className={`${LIVE_DEVICE_ROW_CLASS} w-full`}>
                            {liveDeviceRowItems(tiles).map((item) =>
                                item.kind === "void" ? (
                                    <li key={item.key} aria-hidden="true" className={LIVE_DEVICE_VOID_CLASS}/>
                                ) : (
                                    <li key={item.key} className={LIVE_DEVICE_ITEM_CLASS}>
                                        <DeviceTile tile={item.tile}/>
                                    </li>
                                ),
                            )}
                        </ul>
                    ) : (
                        <div className="grid w-full grid-cols-7 gap-2">
                            {tiles.map((tile) => (
                                <DeviceGauge key={tile.id} tile={tile}/>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}
        </article>
    );
}
