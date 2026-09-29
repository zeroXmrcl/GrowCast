import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {needsSetupWizard} from "@/lib/admin-auth";

/** 1920×1080 program document; site chrome would paint over the camera. */
export default async function ProgramLayout({children}: {children: ReactNode}) {
    if (needsSetupWizard()) {
        redirect("/setup");
    }
    return (
        <div className="h-[1080px] w-[1920px] overflow-hidden bg-black">
            {children}
        </div>
    );
}
