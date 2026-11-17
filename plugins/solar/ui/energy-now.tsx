import {formatKwh, formatShare, formatWatts} from "./format";
import type {SolarViewDto} from "./view-types";

export function EnergyNow({view}: {view: SolarViewDto}) {
    const live = view.live;
    const split = live.allocation;
    const house = live.houseW;
    const tent = live.tentW;
    const rest = house !== null && tent !== null ? Math.max(0, house - tent) : null;
    const tentFrac = house && house > 0 && tent !== null ? tent / house : null;
    const restFrac = tentFrac === null ? null : 1 - tentFrac;
    const charging = live.batteryW !== null && live.batteryW < 0;
    const exportW = live.gridW !== null ? Math.max(0, -live.gridW) : null;
    const importW = live.gridW !== null ? Math.max(0, live.gridW) : null;
    const shareNow = split.solarShareOfHouse;

    return (
        <section className="gc-solar-board">
            <div style={{padding: "1.125rem 1.125rem 0.5rem", display: "flex", justifyContent: "space-between", gap: 12}}>
                <div>
                    <h2>Energy now</h2>
                    <p className="gc-solar-hint">
                        {live.system.name}
                        {live.system.pvPeakW ? ` · ${live.system.pvPeakW / 1000} kWp` : ""}
                        {live.system.batteryWh ? ` · ${live.system.batteryWh / 1000} kWh battery` : ""}
                        {` · allocation ${live.system.allocationMode}`}
                    </p>
                </div>
                <div className="gc-chips">
                    {live.gridMode === 2 ? <span className="gc-chip">Off-grid</span> : <span className="gc-chip">On-grid</span>}
                </div>
            </div>
            <div className="gc-flow">
                <div className="gc-flow-pv">
                    <div className="gc-node gc-node-pv">
                        <p className="gc-solar-label"><i className="gc-pip gc-pip-solar" />PV array</p>
                        <p className="gc-solar-value" style={{fontSize: "1.35rem", margin: "0.35rem 0 0"}}>{formatWatts(view.public.pv ? live.pvW : null)}</p>
                        <p className="gc-solar-hint">Producing{live.system.pvPeakW ? ` · ${live.system.pvPeakW / 1000} kWp` : ""}</p>
                    </div>
                </div>
                <div className="gc-flow-row">
                    <div className="gc-node">
                        <p className="gc-solar-label"><i className="gc-pip gc-pip-battery" />Battery</p>
                        <p className="gc-solar-value" style={{fontSize: "1.5rem", margin: "0.35rem 0 0"}}>
                            {view.public.battery && live.batterySoc !== null ? formatShare(live.batterySoc / 100) : "—"}
                        </p>
                        <p className="gc-solar-hint">
                            {view.public.battery
                                ? `${charging ? "Charging" : live.batteryW && live.batteryW > 0 ? "Discharging" : "Idle"} ${formatWatts(live.batteryW === null ? null : Math.abs(live.batteryW))}`
                                : "Hidden"}
                        </p>
                        <p className="gc-solar-hint">Discharge counts as solar</p>
                    </div>
                    <div className="gc-node">
                        <p className="gc-solar-label"><i className="gc-pip gc-pip-house" />House</p>
                        <p className="gc-solar-value" style={{fontSize: "1.25rem", margin: "0.35rem 0 0"}}>
                            {formatWatts(house)}
                            <span className="gc-solar-unit"> · {formatShare(shareNow)} solar right now</span>
                        </p>
                        <div className="gc-house-split">
                            <div>
                                <p className="gc-solar-label">Rest of house</p>
                                <p className="gc-solar-value">{formatWatts(rest)}</p>
                            </div>
                            <div>
                                <p className="gc-solar-label">Tent</p>
                                <p className="gc-solar-value">{formatWatts(tent)}</p>
                            </div>
                        </div>
                        <div
                            className="gc-split-bar"
                            style={restFrac !== null && tentFrac !== null
                                ? {gridTemplateColumns: `${restFrac}fr ${tentFrac}fr`}
                                : undefined}
                        >
                            <i />
                            <i className="tent" />
                        </div>
                    </div>
                    <div className="gc-node">
                        <p className="gc-solar-label"><i className="gc-pip gc-pip-grid" />Grid</p>
                        <p className="gc-solar-value" style={{fontSize: "1.25rem", margin: "0.35rem 0 0"}}>
                            {view.public.grid ? `${formatWatts(exportW)} export` : "—"}
                        </p>
                        <p className="gc-solar-hint">Import {view.public.grid ? formatWatts(importW) : "—"}</p>
                    </div>
                </div>
            </div>
            <div className="gc-legend">
                <span><i className="gc-swatch" style={{background: "var(--gc-solar)"}} />Solar (PV + battery discharge)</span>
                <span><i className="gc-swatch" style={{background: "var(--gc-battery)"}} />Battery charge</span>
                <span><i className="gc-swatch" style={{background: "var(--gc-grid)"}} />Grid</span>
                <span><i className="gc-swatch" style={{background: "var(--gc-battery)"}} />Tent share of house</span>
            </div>
            <div className="gc-totals">
                <div>
                    <p className="gc-solar-label">Today · PV</p>
                    <span className="gc-solar-value">{view.public.pv ? formatKwh(view.today.pvKwh).replace(" kWh", "") : "—"}<span className="gc-solar-unit">kWh</span></span>
                    <p className="gc-solar-hint">Produced</p>
                </div>
                <div>
                    <p className="gc-solar-label">Today · house</p>
                    <span className="gc-solar-value">{formatKwh(view.today.houseKwh).replace(" kWh", "")}<span className="gc-solar-unit">kWh</span></span>
                    <p className="gc-solar-hint">{formatKwh(view.today.houseOtherFromSolarKwh !== null && view.today.houseOtherFromGridKwh !== null ? (view.today.houseOtherFromSolarKwh + view.today.houseOtherFromGridKwh) : null)} rest · {formatKwh(view.today.tentKwh)} tent</p>
                </div>
                <div>
                    <p className="gc-solar-label">Today · tent</p>
                    <span className="gc-solar-value">{view.public.tentShare ? formatShare(view.today.tentKwh && view.today.tentFromSolarKwh !== null ? view.today.tentFromSolarKwh / view.today.tentKwh : null) : "—"}</span>
                    <p className="gc-solar-hint">{formatKwh(view.today.tentFromSolarKwh)} solar · {formatKwh(view.today.tentFromGridKwh)} grid</p>
                </div>
                <div>
                    <p className="gc-solar-label">Today · grid</p>
                    <span className="gc-solar-value">{view.public.grid ? formatKwh(view.today.gridImportKwh).replace(" kWh", "") : "—"}<span className="gc-solar-unit">kWh in</span></span>
                    <p className="gc-solar-hint">{formatKwh(view.today.gridExportKwh)} exported</p>
                </div>
                <div>
                    <p className="gc-solar-label">Battery</p>
                    <span className="gc-solar-value">{view.public.battery && live.batterySoc !== null ? formatShare(live.batterySoc / 100) : "—"}</span>
                    <p className="gc-solar-hint">SoC</p>
                </div>
            </div>
        </section>
    );
}
