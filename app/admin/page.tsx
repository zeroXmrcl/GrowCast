import {getAdminAuthStatus, isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {loginAction, saveGrowAction} from "@/app/admin/actions";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminFlashNotice} from "@/app/admin/admin-notice";
import {AdminHashRedirect} from "@/app/admin/hash-redirect";
import {AdminLoginForm} from "@/app/admin/login-form";
import MediaManager from "@/app/admin/media-manager";
import {GrowSettingsFields} from "@/app/admin/settings-fields";
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

    const grow = await getCurrentGrow();

    return (
        <AdminChrome
            title="Grow"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminHashRedirect/>
            <AdminFlashNotice notice={params.notice}/>
            <AdminSettingsForm growId={grow.id} saveAction={saveGrowAction}>
                <GrowSettingsFields grow={grow}/>
            </AdminSettingsForm>
            <MediaManager/>
        </AdminChrome>
    );
}
