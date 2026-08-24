import type {ReactNode} from "react";
import SiteHeader from "@/components/site-header";
import {listArchivedGrows} from "@/lib/archives";
import {getCurrentGrow} from "@/lib/db";
import {isTimelapsePluginInstalled} from "@/lib/extension-status";
import {hasGgsLiveUi} from "@/lib/ggs-live-store";
import {SITE_FRAME_CLASS} from "@/lib/site-frame";

export default async function SiteLayout({children}: {children: ReactNode}) {
    const [grow, showEnergy, showGallery, archives] = await Promise.all([
        getCurrentGrow(),
        hasGgsLiveUi(),
        isTimelapsePluginInstalled(),
        listArchivedGrows(),
    ]);

    return (
        <div className="flex min-h-full flex-col">
            <SiteHeader
                showEnergy={showEnergy}
                showGallery={showGallery}
                showPastGrows={archives.length > 0}
                showSettingsLink={grow.showSettingsLink}
            />
            <div className={`${SITE_FRAME_CLASS} flex flex-1 flex-col`}>
                {children}
            </div>
        </div>
    );
}
