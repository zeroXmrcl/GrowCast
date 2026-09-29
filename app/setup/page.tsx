import {redirect} from "next/navigation";
import {isAdminAuthenticated, needsSetupWizard} from "@/lib/admin-auth";
import {readInstallerProgress} from "@/lib/installer-progress";
import {ensureMeshToken} from "@/lib/mesh-token";
import {SetupWizard} from "@/app/setup/setup-wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
    if (!needsSetupWizard()) {
        redirect("/");
    }
    await ensureMeshToken();
    const progress = await readInstallerProgress();
    const signedIn = progress.username.length > 0 && await isAdminAuthenticated();
    return (
        <SetupWizard
            initial={signedIn ? progress : {
                step: "admin",
                username: "",
                finished: [],
                skipped: [],
                streamUrl: null,
                climate: null,
                twitchSaved: false,
                timelapse: null,
            }}
        />
    );
}
