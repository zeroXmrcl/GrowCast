import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {
    saveStreamAction,
    saveTwitchKeyAction,
    startTwitchRestreamAction,
    stopTwitchRestreamAction,
} from "@/app/admin/actions";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminFlashNotice} from "@/app/admin/admin-notice";
import {RestreamPanel} from "@/app/admin/restream-panel";
import {AdminSettingsForm} from "@/app/admin/settings-form";
import {StreamSettingsFields} from "@/app/admin/stream-fields";
import {StreamPreview} from "@/app/admin/stream-preview";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {overlayPublicUrl} from "@/lib/overlay-layout";
import {ensureRestreamCaptureToken} from "@/lib/restream/capture";
import {readRestreamPublicView} from "@/lib/restream/store";
import {shareCardMetadataOrigin} from "@/lib/share-card";

type StreamPageProps = {
    searchParams: Promise<{
        notice?: string;
    }>;
};

export default async function AdminStreamPage({searchParams}: StreamPageProps) {
    const params = await searchParams;

    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const [grow, headerList, restream] = await Promise.all([
        getCurrentGrow(),
        headers(),
        readRestreamPublicView(),
        ensureRestreamCaptureToken(),
    ]);
    const overlayUrl = overlayPublicUrl(shareCardMetadataOrigin(headerList));

    return (
        <AdminChrome
            title="Stream"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminFlashNotice notice={params.notice}/>
            <StreamPreview grow={grow}/>
            <AdminSettingsForm growId={grow.id} saveAction={saveStreamAction}>
                <StreamSettingsFields grow={grow} overlayUrl={overlayUrl}/>
            </AdminSettingsForm>
            <RestreamPanel
                view={restream}
                saveKeyAction={saveTwitchKeyAction}
                startAction={startTwitchRestreamAction}
                stopAction={stopTwitchRestreamAction}
            />
        </AdminChrome>
    );
}
