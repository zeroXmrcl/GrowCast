"use client";

import {
    Card,
    definePlugin,
    PageShell,
    PowerFlow,
    Stat,
    useAuth,
    usePluginLive,
} from "@growcast/plugin-sdk/ui";

function EnergyPage() {
    const live = usePluginLive();
    const {role} = useAuth();
    const allocation = (live.state?.allocation ?? null) as {
        tentFromSolarW?: number | null;
        tentFromGridW?: number | null;
        solarShareOfTent?: number | null;
        missing?: string[];
    } | null;
    return (
        <PageShell title="Solar" updatedAt={live.updatedAt} stale={live.stale}>
            {live.v("grid.mode") === 2 ? <Card tone="warning">Emergency power: running off-grid</Card> : null}
            <PowerFlow
                pv={live.v("pv.power")}
                battery={live.v("battery.power")}
                grid={live.v("grid.power")}
                house={live.v("house.power")}
                soc={live.v("battery.soc")}
            />
            <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Tent from solar" value={allocation?.tentFromSolarW ?? null} unit="W" />
                <Stat label="Tent from grid" value={allocation?.tentFromGridW ?? null} unit="W" />
                <Stat
                    label="Solar share of tent"
                    value={allocation?.solarShareOfTent == null ? null : allocation.solarShareOfTent * 100}
                    unit="%"
                />
            </div>
            {allocation?.missing?.length ? (
                <p className="text-sm text-zinc-500">Missing readings: {allocation.missing.join(", ")} (not replaced with 0)</p>
            ) : null}
            {role === "admin" ? (
                <a href="/admin/plugins/growcast.solar">Solar connection settings</a>
            ) : null}
        </PageShell>
    );
}

function EnergyFlowWidget() {
    const live = usePluginLive();
    return (
        <PowerFlow
            pv={live.v("pv.power")}
            battery={live.v("battery.power")}
            grid={live.v("grid.power")}
            house={live.v("house.power")}
            soc={live.v("battery.soc")}
        />
    );
}

function BatteryWidget() {
    const live = usePluginLive();
    const soc = live.v("battery.soc");
    const power = live.v("battery.power");
    const label = power === null ? "Battery" : power >= 0 ? "Discharging" : "Charging";
    return <Stat label={label} value={soc} unit="%" />;
}

function TentSolarShareWidget() {
    const live = usePluginLive();
    const allocation = (live.state?.allocation ?? null) as {solarShareOfTent?: number | null} | null;
    return (
        <Stat
            label="Solar share of tent"
            value={allocation?.solarShareOfTent == null ? null : allocation.solarShareOfTent * 100}
            unit="%"
        />
    );
}

function AdminPage() {
    return (
        <PageShell title="Solar settings">
            <p className="text-sm text-zinc-500">
                Adapter, allocation and valuation settings are saved from Admin → Plugins → enable, then this page.
                Configure FEMS host, password, REST or Modbus, PV peak, battery capacity, allocation mode, and tariffs there.
            </p>
            {/* Plugin UI is an ES module; do not import next/link. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="text-sm underline" href="/admin/plugins">Open plugin settings</a>
        </PageShell>
    );
}

export default definePlugin({
    pages: {energy: EnergyPage, admin: AdminPage},
    widgets: {
        "energy-flow": EnergyFlowWidget,
        battery: BatteryWidget,
        "tent-solar-share": TentSolarShareWidget,
    },
});
