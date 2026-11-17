import {saveEnergyAction} from "@/plugins/ggs/admin/actions";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {AdminSaveForm} from "@/app/admin/admin-save-form";
import {EnergySettingsFields} from "@/plugins/ggs/admin/energy-fields";
import {SpiderFarmerLoginPanel} from "@/plugins/ggs/admin/spider-farmer-panel";
import {readSpiderFarmerBrokerStatus} from "@/plugins/ggs/host/ggs-sidecar-env";
import {readStoredControllers} from "@/plugins/ggs/host/controllers";
import {energyActuatorRows, readEnergySettings} from "@/plugins/ggs/host/energy/settings";
import {withStale} from "@/plugins/ggs/host/ggs-live";
import {readGgsLive} from "@/plugins/ggs/host/ggs-live-store";

export default async function AdminGgsPage() {
    const [energySettings, live, spiderFarmer, controllers] = await Promise.all([
        readEnergySettings(),
        readGgsLive(),
        readSpiderFarmerBrokerStatus().catch(() => ({
            configured: false,
            account: null,
            serial: null,
            pathKind: "missing" as const,
        })),
        readStoredControllers(),
    ]);
    const view = live ? withStale(live) : null;

    return (
        <AdminBandGroup>
            <SpiderFarmerLoginPanel status={spiderFarmer} controllers={controllers}/>
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
                {view && view.devices.length > 0 ? (
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
            <AdminSaveForm action={saveEnergyAction}>
                <EnergySettingsFields
                    energySettings={energySettings}
                    energyActuators={energyActuatorRows(live, energySettings)}
                />
            </AdminSaveForm>
        </AdminBandGroup>
    );
}
