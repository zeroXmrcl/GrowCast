import {redirect} from "next/navigation";
import {needsSetupWizard} from "@/lib/admin-auth";
import {ensureMeshToken} from "@/lib/mesh-token";
import {SetupWizard} from "@/app/setup/setup-wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
    if (!needsSetupWizard()) {
        redirect("/");
    }
    await ensureMeshToken();
    return <SetupWizard/>;
}
