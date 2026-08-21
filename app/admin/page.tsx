import {getAdminAuthStatus, isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {getTimelapseSettings} from "@/lib/timelapse-settings";
import {completeGrowAction, loginAction, saveGrowAction} from "@/app/admin/actions";
import {AdminLoginForm} from "@/app/admin/login-form";
import {AdminSettingsForm} from "@/app/admin/settings-form";

type AdminPageProps = {
    searchParams: Promise<{
        error?: string;
        saved?: string;
        archived?: string;
        media?: string;
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

    const grow = await getCurrentGrow();
    const timelapseSettings = await getTimelapseSettings();

    return (
        <AdminSettingsForm
            grow={grow}
            timelapseSettings={timelapseSettings}
            saved={params.saved}
            archived={params.archived}
            media={params.media}
            error={params.error}
            saveAction={saveGrowAction}
            completeAction={completeGrowAction}
        />
    );
}
