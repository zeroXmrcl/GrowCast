"use client";

import {EnergyFlowWidget, BatteryWidget, TentSolarShareWidget} from "@/plugins/solar/ui/widgets";

export default function SolarWidgetsPage() {
    return (
        <div className="gc-solar">
            <div className="gc-solar-page">
                <header className="gc-solar-head">
                    <div>
                        <p className="gc-solar-meta">Widgets · dashboard and stream overlay · add ?sample=1 for mocked data</p>
                        <h1>Solar widgets</h1>
                    </div>
                </header>
                <div className="gc-widget-grid demo">
                    <TentSolarShareWidget />
                    <BatteryWidget />
                    <EnergyFlowWidget />
                </div>
            </div>
        </div>
    );
}
