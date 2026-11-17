import {definePlugin, PageShell, PowerFlow, Stat, usePluginLive} from "@growcast/plugin-sdk/ui";

function EnergyPage() {
    const live = usePluginLive();
    return (
        PageShell({
            title: "Solar",
            updatedAt: live.updatedAt,
            stale: live.stale,
            children: PowerFlow({
                pv: live.v("pv.power"),
                battery: live.v("battery.power"),
                grid: live.v("grid.power"),
                house: live.v("house.power"),
                soc: live.v("battery.soc"),
            }),
        })
    );
}

function EnergyFlowWidget() {
    const live = usePluginLive();
    return PowerFlow({
        pv: live.v("pv.power"),
        battery: live.v("battery.power"),
        grid: live.v("grid.power"),
        house: live.v("house.power"),
        soc: live.v("battery.soc"),
    });
}

function BatteryWidget() {
    const live = usePluginLive();
    return Stat({label: "Battery", value: live.v("battery.soc"), unit: "%"});
}

function TentSolarShareWidget() {
    const live = usePluginLive();
    const allocation = live.state && live.state.allocation ? live.state.allocation : null;
    const share = allocation && typeof allocation.solarShareOfTent === "number"
        ? allocation.solarShareOfTent * 100
        : null;
    return Stat({label: "Solar share of tent", value: share, unit: "%"});
}

function AdminPage() {
    return PageShell({
        title: "Solar settings",
        children: Stat({label: "Open Admin → Plugins to save adapter settings", value: null}),
    });
}

export default definePlugin({
    pages: {energy: EnergyPage, admin: AdminPage},
    widgets: {
        "energy-flow": EnergyFlowWidget,
        battery: BatteryWidget,
        "tent-solar-share": TentSolarShareWidget,
    },
});
