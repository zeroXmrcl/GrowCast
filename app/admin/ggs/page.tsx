import {redirect} from "next/navigation";
import {saveEnergyAction} from "@/app/admin/actions";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {AdminSaveForm} from "@/app/admin/admin-save-form";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {EnergySettingsFields} from "@/app/admin/energy-fields";
import {SpiderFarmerLoginPanel} from "@/app/admin/spider-farmer-panel";
import {readSpiderFarmerBrokerStatus} from "@/lib/ggs-sidecar-env";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {energyActuatorRows, readEnergySettings} from "@/lib/energy/settings";
import {withStale} from "@/lib/ggs-live";
import {readGgsLive} from "@/lib/ggs-live-store";

export default async function AdminGgsPage() {
    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const [energySettings, live, spiderFarmer] = await Promise.all([
        readEnergySettings(),
        readGgsLive(),
        readSpiderFarmerBrokerStatus().catch(() => ({configured: false, account: null})),
    ]);
    const view = live ? withStale(live) : null;

    return (
        <AdminChrome
            title="GGS"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminBandGroup>
                <SpiderFarmerLoginPanel status={spiderFarmer}/>
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
                                <li
                                    key={`${device.name}-${index}`}
                                    className="text-sm text-(--admin-text)"
                                >
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
        </AdminChrome>
    );
}
