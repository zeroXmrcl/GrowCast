import {redirect} from "next/navigation";
import {saveTimelapseAction} from "@/app/admin/actions";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminFlashNotice} from "@/app/admin/admin-notice";
import {AdminSettingsForm} from "@/app/admin/settings-form";
import {TimelapseSettingsFields} from "@/app/admin/timelapse-fields";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getTimelapseSettings} from "@/lib/timelapse-settings";

type TimelapsePageProps = {
    searchParams: Promise<{
        notice?: string;
    }>;
};

export default async function AdminTimelapsePage({searchParams}: TimelapsePageProps) {
    const params = await searchParams;

    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const timelapseSettings = await getTimelapseSettings();

    return (
        <AdminChrome
            title="Timelapse"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminFlashNotice notice={params.notice}/>
            <AdminSettingsForm saveAction={saveTimelapseAction}>
                <TimelapseSettingsFields timelapseSettings={timelapseSettings}/>
            </AdminSettingsForm>
        </AdminChrome>
    );
}
