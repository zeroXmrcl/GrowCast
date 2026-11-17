import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {needsSetupWizard} from "@/lib/admin-auth";
import SiteShell from "@/components/site-shell";

export default async function SiteLayout({children}: {children: ReactNode}) {
    if (needsSetupWizard()) {
        redirect("/setup");
    }
    return <SiteShell>{children}</SiteShell>;
}
