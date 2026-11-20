import type {ReactNode} from "react";
import SiteHeader from "@/components/site-header";
import WorkspaceFrame from "@/components/workspace-frame";
import PluginWidgets from "@/components/plugin-widgets";
import {WorkspaceNavProvider} from "@/components/workspace-nav";
import {listArchivedGrows} from "@/lib/archives";
import {getCurrentGrow} from "@/lib/db";
import {SITE_FRAME_CLASS} from "@/lib/site-frame";
import {pluginSiteNavItems} from "@/lib/plugins/nav";
import {safeHttpUrlOrEmpty} from "@/lib/url-policy";

export default async function SiteShell({children}: {children: ReactNode}) {
    const [grow, archives, pluginNav] = await Promise.all([
        getCurrentGrow(),
        listArchivedGrows(),
        pluginSiteNavItems(),
    ]);

    return (
        <WorkspaceNavProvider>
            <div className="flex min-h-full flex-col">
                <SiteHeader
                    showPastGrows={archives.length > 0}
                    showSettingsLink={grow.showSettingsLink}
                    extra={pluginNav.map((item) => ({href: item.href, label: item.label}))}
                />
                <div className={`${SITE_FRAME_CLASS} flex flex-1 flex-col`}>
                    <WorkspaceFrame
                        streamUrl={safeHttpUrlOrEmpty(grow.streamUrl)}
                        growName={grow.name}
                        showGrowName={grow.showGrowName}
                    >
                        {children}
                    </WorkspaceFrame>
                </div>
                <PluginWidgets slot="site-chrome" />
            </div>
        </WorkspaceNavProvider>
    );
}
