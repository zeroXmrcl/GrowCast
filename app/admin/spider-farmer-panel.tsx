import {connectSpiderFarmerAction} from "@/app/admin/actions";
import {AdminButton, AdminField, AdminInput, AdminPanel} from "@/components/admin/ui";
import type {SpiderFarmerBrokerStatus} from "@/lib/ggs-sidecar-env";

export function SpiderFarmerLoginPanel({status}: {status: SpiderFarmerBrokerStatus}) {
    return (
        <AdminPanel
            id="spider-farmer"
            title="Spider Farmer"
            description="Email and password from the Spider Farmer app. A successful login saves the broker username and password into the sidecar env."
        >
            <form action={connectSpiderFarmerAction} className="space-y-3">
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
                <AdminField
                    label="Password"
                    hint="Sent only to Spider Farmer. It is not written to the env file."
                >
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
            </form>
        </AdminPanel>
    );
}
