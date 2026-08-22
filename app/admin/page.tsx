import {getAdminAuthStatus, isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {getTimelapseSettings} from "@/lib/timelapse-settings";
import {completeGrowAction, loginAction, saveGrowAction} from "@/app/admin/actions";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminFlashNotice} from "@/app/admin/admin-notice";
import {CompleteGrowPanel} from "@/app/admin/complete-grow-panel";
import {AdminLoginForm} from "@/app/admin/login-form";
import MediaManager from "@/app/admin/media-manager";
import {AdminSettingsForm} from "@/app/admin/settings-form";

type AdminPageProps = {
    searchParams: Promise<{
        error?: string;
        notice?: string;
        retry?: string;
    }>;
};

export default async function AdminPage({searchParams}: AdminPageProps) {
    const params = await searchParams;
    const isLoggedIn = await isAdminAuthenticated();
    const adminStatus = getAdminAuthStatus();

    if (!isLoggedIn) {
        return (
            <AdminLoginForm
                error={params.error}
                canLogin={adminStatus.canLogin}
                warnings={adminStatus.warnings}
                loginAction={loginAction}
            />
        );
    }

    const [grow, timelapseSettings] = await Promise.all([
        getCurrentGrow(),
        getTimelapseSettings(),
    ]);

    return (
        <AdminChrome
            title="Settings"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminFlashNotice notice={params.notice}/>
            <AdminSettingsForm
                grow={grow}
                timelapseSettings={timelapseSettings}
                saveAction={saveGrowAction}
            />
            <MediaManager/>
            <CompleteGrowPanel growId={grow.id} completeAction={completeGrowAction}/>
        </AdminChrome>
    );
}
