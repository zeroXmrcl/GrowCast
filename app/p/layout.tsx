import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {needsSetupWizard} from "@/lib/admin-auth";
import SiteShell from "@/components/site-shell";
import {resolvePluginPage} from "@/lib/plugins/routes";

export default async function PluginPagesLayout({
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
        return children;
    }
    return <SiteShell>{children}</SiteShell>;
}
