import Link from "next/link";
import {saveAlertsSettingsAction} from "@/app/admin/actions";
import {AdminButton, AdminCheckboxRow, AdminPanel} from "@/components/admin/ui";
import type {AlertsSettings} from "@/lib/restream/alerts-settings";

export function AlertsPanel({settings}: {settings: AlertsSettings}) {
    return (
        <AdminPanel
            id="alerts"
            title="Alerts"
            actions={
                <Link
                    href="/admin/stream/twitch-connect"
                    className="inline-flex h-10 items-center justify-center rounded-md border border-(--admin-border-strong) bg-(--admin-surface) px-4 text-sm font-medium text-(--admin-text) hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                >
                    Connect Twitch
                </Link>
            }
        >
            <form action={saveAlertsSettingsAction} className="space-y-3">
                <AdminCheckboxRow name="follow" label="Follow" defaultChecked={settings.follow}/>
                <AdminCheckboxRow name="sub" label="Sub" defaultChecked={settings.sub}/>
                <AdminCheckboxRow name="raid" label="Raid" defaultChecked={settings.raid}/>
                <AdminCheckboxRow name="bits" label="Bits" defaultChecked={settings.bits}/>
                <AdminCheckboxRow
                    name="stingEnabled"
                    label="Alert sound"
                    defaultChecked={settings.stingEnabled}
                />
                <AdminButton type="submit" tone="secondary">
                    Save
                </AdminButton>
            </form>
        </AdminPanel>
    );
}
