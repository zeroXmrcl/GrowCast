import {useState, type ReactNode} from "react";
import {usePluginLive, useTheme} from "@growcast/plugin-sdk/ui";
import {formatShare, formatWatts, signedWatts} from "./format";
import {useSolarView} from "./use-solar-view";

function useOverlay(): boolean {
    const [overlay] = useState(() => (
        typeof document !== "undefined" && Boolean(document.querySelector("[data-overlay-root]"))
    ));
    return overlay;
}

function Shell({children}: {children: ReactNode}) {
    const overlay = useOverlay();
    useTheme();
    return (
        <div className="gc-solar" data-overlay={overlay ? "1" : "0"}>
            {children}
        </div>
    );
}

function useWidgetLive() {
    const live = usePluginLive();
    const view = useSolarView("live");
    if (view) {
        return {
            pv: view.public.pv ? view.live.pvW : null,
            house: view.live.houseW,
            tent: view.live.tentW,
            battery: view.public.battery ? view.live.batteryW : null,
            soc: view.public.battery ? view.live.batterySoc : null,
            grid: view.public.grid ? view.live.gridW : null,
            share: view.public.tentShare ? view.live.allocation.solarShareOfTent : null,
        };
    }
    const allocation = live.state?.allocation;
    const share = allocation && typeof allocation === "object"
        ? (allocation as {solarShareOfTent?: unknown}).solarShareOfTent
        : null;
    return {
        pv: live.v("pv.power"),
        house: live.v("house.power"),
        tent: live.v("tent.power"),
        battery: live.v("battery.power"),
        soc: live.v("battery.soc"),
        grid: live.v("grid.power"),
        share: typeof share === "number" && Number.isFinite(share) ? share : null,
    };
}

export function EnergyFlowWidget() {
    const now = useWidgetLive();
    return (
        <Shell>
            <div className="gc-widget">
                <p className="gc-solar-label">Energy now</p>
                <p className="big">{formatWatts(now.pv)} <span className="gc-solar-unit">PV</span></p>
                <div className="gc-house-split" style={{marginTop: 8}}>
                    <div>
                        <p className="gc-solar-label">House</p>
                        <p className="gc-solar-value">{formatWatts(now.house)}</p>
                    </div>
                    <div>
                        <p className="gc-solar-label">Tent</p>
                        <p className="gc-solar-value">{formatWatts(now.tent)}</p>
                    </div>
                    <div>
                        <p className="gc-solar-label">Battery</p>
                        <p className="gc-solar-value">{signedWatts(now.battery)}</p>
                    </div>
                    <div>
                        <p className="gc-solar-label">Grid</p>
                        <p className="gc-solar-value">{signedWatts(now.grid)}</p>
                    </div>
                </div>
            </div>
        </Shell>
    );
}

export function BatteryWidget() {
    const now = useWidgetLive();
    const charging = now.battery !== null && now.battery < 0;
    return (
        <Shell>
            <div className="gc-widget">
                <p className="gc-solar-label">Battery</p>
                <p className="big">{now.soc === null ? "—" : `${Math.round(now.soc)}%`}</p>
                <p className="gc-solar-hint">
                    {now.battery === null
                        ? "—"
                        : `${charging ? "Charging" : now.battery > 0 ? "Discharging" : "Idle"} ${formatWatts(Math.abs(now.battery))}`}
                </p>
                <div className="gc-bar">
                    <span style={{width: `${Math.max(0, Math.min(100, now.soc ?? 0))}%`}} />
                </div>
            </div>
        </Shell>
    );
}

export function TentSolarShareWidget() {
    const now = useWidgetLive();
    const r = 28;
    const c = 2 * Math.PI * r;
    const dash = now.share === null ? 0 : now.share * c;
    return (
        <Shell>
            <div className="gc-widget">
                <p className="gc-solar-label">Solar share of tent</p>
                <div className="gc-ring-wrap">
                    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
                        <circle cx="36" cy="36" r={r} fill="none" stroke="#e4e4e7" strokeWidth="8" />
                        {now.share !== null ? (
                            <circle
                                cx="36"
                                cy="36"
                                r={r}
                                fill="none"
                                stroke="var(--gc-solar)"
                                strokeWidth="8"
                                strokeDasharray={`${dash} ${c}`}
                                transform="rotate(-90 36 36)"
                            />
                        ) : null}
                    </svg>
                    <div>
                        <p className="big">{formatShare(now.share)}</p>
                        <p className="gc-solar-hint">{formatWatts(now.tent)}{now.share === 1 ? " · all solar" : ""}</p>
                    </div>
                </div>
            </div>
        </Shell>
    );
}
