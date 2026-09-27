import {connectSpiderFarmerAction} from "@/app/admin/actions";
import {AdminBand} from "@/app/admin/admin-band";
import {AdminImmediateForm} from "@/app/admin/admin-save-form";
import {AdminButton, AdminField, AdminInput} from "@/components/admin/ui";
import type {SpiderFarmerBrokerStatus} from "@/lib/ggs-sidecar-env";

export function SpiderFarmerLoginPanel({status}: {status: SpiderFarmerBrokerStatus}) {
    return (
        <AdminBand id="spider-farmer" title="Spider Farmer">
            <AdminImmediateForm action={connectSpiderFarmerAction} className="space-y-3">
                <p className="text-sm text-(--admin-muted)">
                    {status.configured
                        ? `Broker login saved${status.account ? ` for ${status.account}` : ""}. Restart the ggs sidecar to use it.`
                        : "No broker login saved yet."}
                </p>
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
                <AdminButton type="submit" tone="primary">
                    Log in
                </AdminButton>
            </AdminImmediateForm>
        </AdminBand>
    );
}
