import {redirect} from "next/navigation";
import {saveTimelapseAction} from "@/app/admin/actions";
import {AdminBandGroup} from "@/app/admin/admin-band";
import {AdminSaveForm} from "@/app/admin/admin-save-form";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {TimelapseSettingsFields} from "@/app/admin/timelapse-fields";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getTimelapseSettings} from "@/lib/timelapse-settings";
import {readTimelapseRtsp} from "@/lib/timelapse-sidecar-env";

export default async function AdminTimelapsePage() {
    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const [timelapseSettings, rtspStream] = await Promise.all([
        getTimelapseSettings(),
        readTimelapseRtsp().catch(() => ""),
    ]);

    return (
        <AdminChrome
            title="Timelapse"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminBandGroup>
                <AdminSaveForm action={saveTimelapseAction}>
                    <TimelapseSettingsFields timelapseSettings={timelapseSettings} rtspStream={rtspStream}/>
                </AdminSaveForm>
            </AdminBandGroup>
        </AdminChrome>
    );
}
