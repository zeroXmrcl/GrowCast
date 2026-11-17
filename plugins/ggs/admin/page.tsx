"use client";

import {AdminBand, AdminBandGroup, PluginSaveForm, usePluginAdminState} from "@/lib/plugins/admin-kit";
import {EnergySettingsFields} from "@/plugins/ggs/admin/energy-fields";
import {SpiderFarmerLoginPanel} from "@/plugins/ggs/admin/spider-farmer-panel";
import type {EnergyActuatorRow, EnergySettings} from "@/plugins/ggs/host/energy/settings";
import type {SpiderFarmerBrokerStatus} from "@/plugins/ggs/host/ggs-sidecar-env";
import type {SpiderFarmerController} from "@/plugins/ggs/host/spider-farmer-login";

type GgsAdminState = {
    energySettings: EnergySettings;
    energyActuators: EnergyActuatorRow[];
    spiderFarmer: SpiderFarmerBrokerStatus;
    controllers: SpiderFarmerController[];
    live: {updatedAt?: string | null; online?: boolean; devices?: Array<{name: string; online: boolean}>} | null;
};

export default function AdminGgsPage() {
    const {data, reload} = usePluginAdminState<GgsAdminState>("admin-state");
    if (!data) {
        return <p className="text-sm text-(--admin-muted)">Loading GGS…</p>;
    }
    const view = data.live;

    return (
        <AdminBandGroup>
            <SpiderFarmerLoginPanel status={data.spiderFarmer} controllers={data.controllers}/>
            <AdminBand id="sidecar" title="Sidecar">
                {view ? (
                    <div className="space-y-1 text-sm text-(--admin-text)">
                        <p>Last update: {view.updatedAt ?? "—"}</p>
                        <p>Online: {view.online ? "yes" : "no"}</p>
                    </div>
                ) : (
                    <p className="text-sm text-(--admin-muted)">sidecar not reporting</p>
                )}
            </AdminBand>
            <AdminBand id="devices" title="Devices">
                {view && view.devices && view.devices.length > 0 ? (
                    <ul className="space-y-2">
                        {view.devices.map((device, index) => (
                            <li key={`${device.name}-${index}`} className="text-sm text-(--admin-text)">
                                {device.name}
                                <span className="text-(--admin-muted)">
                                    {" "}
                                    — {device.online ? "online" : "offline"}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : view ? null : (
                    <p className="text-sm text-(--admin-muted)">sidecar not reporting</p>
                )}
            </AdminBand>
            <PluginSaveForm actionPath="energy" onSaved={reload}>
                <EnergySettingsFields
                    energySettings={data.energySettings}
                    energyActuators={data.energyActuators}
                />
            </PluginSaveForm>
        </AdminBandGroup>
    );
}
