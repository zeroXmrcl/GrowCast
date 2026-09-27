import {getAdminAuthStatus, isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {loginAction, saveGrowAction} from "@/app/admin/actions";
import {AdminBandGroup} from "@/app/admin/admin-band";
import {AdminSaveForm} from "@/app/admin/admin-save-form";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminHashRedirect} from "@/app/admin/hash-redirect";
import {AdminLoginForm} from "@/app/admin/login-form";
import MediaManager from "@/app/admin/media-manager";
import {GrowSettingsFields} from "@/app/admin/settings-fields";

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
            <AdminBandGroup>
                <AdminSaveForm action={saveGrowAction}>
                    <input type="hidden" name="growId" value={grow.id}/>
                    <GrowSettingsFields grow={grow}/>
                </AdminSaveForm>
                <MediaManager/>
            </AdminBandGroup>
        </AdminChrome>
    );
}
