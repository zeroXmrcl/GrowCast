import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {needsSetupWizard} from "@/lib/admin-auth";

/** Transparent HUD for OBS; site chrome would paint over the camera. */
export default async function OverlayLayout({children}: {children: ReactNode}) {
    if (needsSetupWizard()) {
        redirect("/setup");
    }
    return (
        <div data-overlay-root className="h-dvh w-full">
            {children}
        </div>
    );
}
