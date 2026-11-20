import {formatEur, formatKwh, formatShare, formatWatts} from "./format";
import type {SolarViewDto} from "./view-types";

export function TentSplitCard({view}: {view: SolarViewDto}) {
    const totals = view.range === "live" ? view.today : view.totals;
    const tentKwh = totals.tentKwh;
    const solarKwh = totals.tentFromSolarKwh;
    const share = tentKwh && tentKwh > 0 && solarKwh !== null ? solarKwh / tentKwh : null;
    const r = 52;
    const c = 2 * Math.PI * r;
    const solarDash = share === null ? 0 : share * c;
    return (
        <section className="gc-solar-card">
            <h2>Tent split</h2>
            <div className="gc-ring-wrap">
                <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
                    <circle cx="64" cy="64" r={r} fill="none" stroke="#e4e4e7" strokeWidth="12" />
                    {share !== null ? (
                        <circle
                            cx="64"
                            cy="64"
                            r={r}
                            fill="none"
                            stroke="var(--gc-solar)"
                            strokeWidth="12"
                            strokeDasharray={`${solarDash} ${c}`}
                            transform="rotate(-90 64 64)"
                        />
                    ) : null}
                    {share !== null && share < 1 ? (
                        <circle
                            cx="64"
                            cy="64"
                            r={r}
                            fill="none"
                            stroke="var(--gc-grid)"
                            strokeWidth="12"
                            strokeDasharray={`${c - solarDash} ${c}`}
                            strokeDashoffset={-solarDash}
                            transform="rotate(-90 64 64)"
                        />
                    ) : null}
                    <text x="64" y="62" textAnchor="middle" fontSize="22" fontWeight="600" fill="#18181b">{formatShare(share)}</text>
                    <text x="64" y="80" textAnchor="middle" fontSize="11" fill="#71717a">solar</text>
                </svg>
                <div>
                    <p className="gc-solar-label">Solar share of tent</p>
                    <p className="gc-solar-value" style={{fontSize: "1.75rem"}}>
                        {formatKwh(solarKwh).replace(" kWh", "")}
                        <span className="gc-solar-unit">kWh solar</span>
                    </p>
                    <p className="gc-solar-hint">
                        PV and battery discharge are shown separately on the chart. In this split they sum as solar.
                        {totals.tentFromGridKwh !== null ? ` ${formatKwh(totals.tentFromGridKwh)} from the grid.` : ""}
                        {` Allocation: ${view.live.system.allocationMode}.`}
                    </p>
                </div>
            </div>
        </section>
    );
}

export function TentCostCard({view}: {view: SolarViewDto}) {
    const s = view.savings;
    const solarLabel = s.solarKwhValueEur === 0 ? "0.00 €/kWh" : s.solarKwhValueEur === null ? "—" : `${s.solarKwhValueEur.toFixed(2)} €/kWh`;
    return (
        <section className="gc-solar-card">
            <div style={{display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start"}}>
                <h2>Tent cost</h2>
                <div className="gc-chips">
                    <span className="gc-chip on">{solarLabel}</span>
                    <span className="gc-chip">Grid {s.gridTariffEurPerKwh === null ? "—" : `${s.gridTariffEurPerKwh.toFixed(2)} €/kWh`}</span>
                </div>
            </div>
            <div className="gc-cost-row">
                <span className="k">Solar · {formatKwh(s.tentFromSolarKwh)} × {s.solarKwhValueEur === null ? "—" : `${s.solarKwhValueEur.toFixed(2)} €`}</span>
                <span className="tabular">{formatEur(s.tentSolarEur)}</span>
            </div>
            <div className="gc-cost-row">
                <span className="k">Grid · {formatKwh(s.tentFromGridKwh)} × {s.gridTariffEurPerKwh === null ? "—" : `${s.gridTariffEurPerKwh.toFixed(2)} €`}</span>
                <span className="tabular">{formatEur(s.tentGridEur)}</span>
            </div>
            <div className="gc-cost-row">
                <span className="k">Tent total</span>
                <span className="tabular">{formatEur(s.tentTotalEur)}</span>
            </div>
            <div className="gc-cost-row">
                <span className="k">If the tent had been all grid</span>
                <span className="tabular">{formatEur(s.gridOnlyEur)}</span>
            </div>
            <p className="gc-solar-hint">
                Savings vs grid-only: {formatEur(s.savingsEur)}. Missing kWh stays missing — not replaced with 0.
            </p>
        </section>
    );
}

export function TentDevicesCard({view}: {view: SolarViewDto}) {
    const devices = view.live.tentDevices;
    return (
        <section className="gc-solar-card">
            <h2>Tent power per device</h2>
            <p className="gc-solar-hint">Live load from the tent energy plugin (light, climate, ventilation). Missing stays —.</p>
            {devices.length === 0 ? (
                <p className="gc-solar-hint">No tent device watts yet.</p>
            ) : (
                <div className="gc-devices">
                    {devices.map((device) => (
                        <div className="gc-device" key={`${device.name}-${device.label}`}>
                            <span>{device.name} · {device.label}</span>
                            <span className="tabular">{formatWatts(device.watts)}</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
