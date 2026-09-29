import {connectSpiderFarmerAction} from "@/app/admin/actions";
import {AdminBand} from "@/app/admin/admin-band";
import {AdminImmediateForm} from "@/app/admin/admin-save-form";
import {AdminButton, AdminField, AdminInput} from "@/components/admin/ui";
import {ControllerSerialField} from "@/app/setup/controller-list";
import type {SpiderFarmerBrokerStatus} from "@/lib/ggs-sidecar-env";
import type {SpiderFarmerController} from "@/lib/spider-farmer-login";

export function SpiderFarmerLoginPanel({
    status,
    controllers = [],
}: {
    status: SpiderFarmerBrokerStatus;
    controllers?: SpiderFarmerController[];
}) {
    const summary = status.pathKind === "directory"
        ? "The climate env path is a folder, so the login cannot save. Remove it and start the stack again."
        : status.configured
            ? `Controller ${status.serial} saved${status.account ? ` for ${status.account}` : ""}. The climate sidecar reloads on its own.`
            : "No controller saved yet.";
    return (
        <AdminBand id="spider-farmer" title="Spider Farmer">
            <AdminImmediateForm action={connectSpiderFarmerAction} className="space-y-3">
                <p className="text-sm text-(--admin-muted)">{summary}</p>
                <AdminField label="Email">
                    <AdminInput
                        name="sfEmail"
                        type="email"
                        autoComplete="username"
                        defaultValue={status.account ?? ""}
                        required
                    />
                </AdminField>
                <AdminField label="Password">
                    <AdminInput
                        name="sfPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                    />
                </AdminField>
                {controllers.length > 1 ? (
                    <ControllerSerialField
                        controllers={controllers}
                        defaultSerial={status.serial ?? controllers[0]?.serial}
                    />
                ) : null}
                <AdminButton type="submit" tone="primary">
                    Log in
                </AdminButton>
            </AdminImmediateForm>
        </AdminBand>
    );
}
