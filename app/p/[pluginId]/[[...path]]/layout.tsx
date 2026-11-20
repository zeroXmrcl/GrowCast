import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {needsSetupWizard} from "@/lib/admin-auth";
import SiteShell from "@/components/site-shell";
import {resolvePluginPage} from "@/lib/plugins/routes";

export default async function PluginPageLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{pluginId: string; path?: string[]}>;
}) {
    if (needsSetupWizard()) {
        redirect("/setup");
    }
    const {pluginId, path} = await params;
    const resolved = await resolvePluginPage(pluginId, path, "site");
    if (resolved?.page.shell === "none") {
        if (resolved.page.viewport === "broadcast") {
            return (
                <div className="h-[1080px] w-[1920px] overflow-hidden bg-black">
                    {children}
                </div>
            );
        }
        return children;
    }
    return <SiteShell>{children}</SiteShell>;
}
