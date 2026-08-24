import type {ReactNode} from "react";
import SiteHeader from "@/components/site-header";
import {getCurrentGrow} from "@/lib/db";
import {SITE_FRAME_CLASS} from "@/lib/site-frame";

export default async function SiteLayout({children}: {children: ReactNode}) {
    const grow = await getCurrentGrow();

    return (
        <div className="flex min-h-full flex-col">
            <SiteHeader showSettingsLink={grow.showSettingsLink}/>
            <div className={`${SITE_FRAME_CLASS} flex flex-1 flex-col`}>
                {children}
            </div>
        </div>
    );
}
