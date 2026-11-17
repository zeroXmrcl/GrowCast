import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {needsSetupWizard} from "@/lib/admin-auth";
import SiteHeader from "@/components/site-header";
import WorkspaceFrame from "@/components/workspace-frame";
import {WorkspaceNavProvider} from "@/components/workspace-nav";
import {listArchivedGrows} from "@/lib/archives";
import {getCurrentGrow} from "@/lib/db";
import {isTimelapsePluginInstalled} from "@/plugins/timelapse/host/extension-status";
import {hasGgsLiveUi} from "@/plugins/ggs/host/ggs-live-store";
import {SITE_FRAME_CLASS} from "@/lib/site-frame";
import {readCameraLook} from "@/plugins/restream/host/camera-look-store";
import {pluginSiteNavItems} from "@/lib/plugins/nav";
import {safeHttpUrlOrEmpty} from "@/lib/url-policy";

export default async function SiteLayout({children}: {children: ReactNode}) {
    if (needsSetupWizard()) {
        redirect("/setup");
    }
    const [grow, look, showEnergy, showGallery, archives, pluginNav] = await Promise.all([
        getCurrentGrow(),
        readCameraLook(),
        hasGgsLiveUi(),
        isTimelapsePluginInstalled(),
        listArchivedGrows(),
        pluginSiteNavItems(),
    ]);

    return (
        <WorkspaceNavProvider>
            <div className="flex min-h-full flex-col">
                <SiteHeader
                    showEnergy={showEnergy}
                    showGallery={showGallery}
                    showPastGrows={archives.length > 0}
                    showSettingsLink={grow.showSettingsLink}
                    extra={pluginNav.map((item) => ({href: item.href, label: item.label}))}
                />
                <div className={`${SITE_FRAME_CLASS} flex flex-1 flex-col`}>
                    <WorkspaceFrame
                        streamUrl={safeHttpUrlOrEmpty(grow.streamUrl)}
                        growName={grow.name}
                        showGrowName={grow.showGrowName}
                        look={look}
                    >
                        {children}
                    </WorkspaceFrame>
                </div>
            </div>
        </WorkspaceNavProvider>
    );
}
