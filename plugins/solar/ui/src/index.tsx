"use client";

import {definePlugin} from "@growcast/plugin-sdk/ui";
import SolarEnergyPage from "@/plugins/solar/pages/energy";
import SolarWidgetsPage from "@/plugins/solar/pages/widgets";
import SolarSettingsPreviewPage from "@/plugins/solar/pages/settings";
import AdminSolarPage from "@/plugins/solar/admin/page";
import {BatteryWidget, EnergyFlowWidget, TentSolarShareWidget} from "@/plugins/solar/ui/widgets";

export default definePlugin({
    pages: {
        energy: SolarEnergyPage,
        widgets: SolarWidgetsPage,
        settings: SolarSettingsPreviewPage,
        admin: AdminSolarPage,
    },
    widgets: {
        "energy-flow": EnergyFlowWidget,
        battery: BatteryWidget,
        "tent-solar-share": TentSolarShareWidget,
    },
});
