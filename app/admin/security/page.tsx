import {redirect} from "next/navigation";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {SecurityPanel, type SecurityView} from "@/app/admin/security-panel";
import {getAdminAccount, isAdminAuthenticated} from "@/lib/admin-auth";
import {inspectAdminTotp, readPendingTotpSetup} from "@/lib/admin-totp";
import {renderTotpQrSvg} from "@/lib/admin-totp-qr";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const account = getAdminAccount();
    const identity = {username: account.username, passwordHash: account.passwordHash};
    const gate = inspectAdminTotp(identity, account.secret);
    const material = gate.state === "corrupt"
        ? null
        : readPendingTotpSetup(identity, account.secret, account.username);
    const pending = material
        ? {
            manualKey: material.manualKey,
            qrSvg: await renderTotpQrSvg(material.otpauthUrl),
            replacing: gate.state === "enrolled",
        }
        : null;
    const status: SecurityView["status"] = gate.state === "corrupt"
        ? "corrupt"
        : gate.state === "enrolled"
            ? "enrolled"
            : pending
                ? "pending"
                : "off";
    const view: SecurityView = {status, pending};

    return (
        <AdminChrome
            title="Security"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <SecurityPanel view={view}/>
        </AdminChrome>
    );
}
