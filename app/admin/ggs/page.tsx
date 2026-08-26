import {redirect} from "next/navigation";
import {saveEnergyAction} from "@/app/admin/actions";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminFlashNotice} from "@/app/admin/admin-notice";
import {EnergySettingsFields} from "@/app/admin/energy-fields";
import {AdminSettingsForm} from "@/app/admin/settings-form";
import {AdminPanel} from "@/components/admin/ui";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {energyActuatorRows, readEnergySettings} from "@/lib/energy/settings";
import {withStale} from "@/lib/ggs-live";
import {readGgsLive} from "@/lib/ggs-live-store";

type GgsPageProps = {
    searchParams: Promise<{
        notice?: string;
    }>;
};

export default async function AdminGgsPage({searchParams}: GgsPageProps) {
    const params = await searchParams;

    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const [energySettings, live] = await Promise.all([
        readEnergySettings(),
        readGgsLive(),
    ]);
    const view = live ? withStale(live) : null;

    return (
        <AdminChrome
            title="GGS"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminFlashNotice notice={params.notice}/>
            <AdminPanel title="Sidecar">
                {view ? (
                    <div className="space-y-1 text-sm text-(--admin-text)">
                        <p>Last update: {view.updatedAt ?? "—"}</p>
                        <p>Online: {view.online ? "yes" : "no"}</p>
                    </div>
                ) : (
                    <p className="text-sm text-(--admin-muted)">sidecar not reporting</p>
                )}
            </AdminPanel>
            <AdminPanel title="Devices">
                {view ? (
                    view.devices.length > 0 ? (
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
                    ) : (
                        <p className="text-sm text-(--admin-muted)">No devices yet.</p>
                    )
                ) : (
                    <p className="text-sm text-(--admin-muted)">sidecar not reporting</p>
                )}
            </AdminPanel>
            <AdminSettingsForm saveAction={saveEnergyAction}>
                <EnergySettingsFields
                    energySettings={energySettings}
                    energyActuators={energyActuatorRows(live, energySettings)}
                />
            </AdminSettingsForm>
        </AdminChrome>
    );
}
